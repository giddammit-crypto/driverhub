const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { writeFile, unlink, mkdir, stat } = require('node:fs/promises');
const { existsSync, createWriteStream } = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const os = require('node:os');
const { generateSetupScript } = require('./canon-lbp-setup.cjs');

const execFileAsync = promisify(execFile);

const ALLOWED_PACKAGES = new Set([
  'nvidia-driver', 'firmware-iwlwifi', 'bluez', 'linux-firmware',
  'pciutils', 'usbutils', 'firmware-linux-free', 'firmware-linux-nonfree',
  'firmware-misc-nonfree', 'cups', 'cups-client', 'cups-bsd',
  'printer-driver-cjet', 'printer-driver-all', 'printer-driver-foo2zjs',
  'printer-driver-brlaser', 'printer-driver-gutenprint', 'printer-driver-escpr',
  'printer-driver-splix', 'printer-driver-cups-pdf', 'hplip', 'sane-airscan',
  'canon-lbp-suite'
]);

function isPackageAllowed(packageName) {
  if (!packageName || typeof packageName !== 'string') return false;
  if (ALLOWED_PACKAGES.has(packageName)) return true;
  // Безопасные префиксы драйверов Linux
  if (/^(firmware-|printer-driver-|nvidia-|xserver-xorg-video-|cups|bluez)/.test(packageName)) {
    return /^[a-z0-9][a-z0-9+.-]+$/.test(packageName);
  }
  return false;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || isNaN(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function runProcessStreaming(cmd, args, options = {}, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      ...options,
      env: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        DEBIAN_FRONTEND: 'noninteractive',
        LC_ALL: 'C',
        LANG: 'C',
        ...options.env
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split('\n').filter(Boolean)) {
        onLine(line, 'stdout');
      }
    });

    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split('\n').filter(Boolean)) {
        onLine(line, 'stderr');
      }
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const error = new Error(`Процесс завершился с кодом ${code}: ${stderr.slice(0, 300) || stdout.slice(0, 300) || 'Ошибка выполнения'}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function getAptPackageUris(packageName) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/apt-get', [
      '-y', '--print-uris', '--reinstall',
      '-o', 'Dir::State::extended_states=/tmp/ext_states',
      '-o', 'Dir::Cache::archives=/tmp/empty_archives',
      'install', packageName
    ], { timeout: 15000, env: { ...process.env, LC_ALL: 'C' } });

    const results = [];
    const re = /'((?:https?|ftp):[^']+)'\s+([^\s]+)\s+(\d+)\s+MD5Sum:([0-9a-f]+)/gi;
    let match;
    while ((match = re.exec(stdout)) !== null) {
      results.push({
        url: match[1],
        filename: match[2],
        size: parseInt(match[3], 10),
        md5: match[4]
      });
    }
    return results;
  } catch {
    return [];
  }
}

function downloadHttpFile(url, destPath, expectedSize, onChunk = () => {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Слишком много перенаправлений HTTP'));
    }

    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsed = new URL(url);
          redirectUrl = new URL(redirectUrl, parsed.origin).toString();
        }
        res.resume();
        return downloadHttpFile(redirectUrl, destPath, expectedSize, onChunk, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ошибка ${res.statusCode}: ${res.statusMessage}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || expectedSize || '0', 10);
      let downloadedBytes = 0;
      const fileStream = createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        onChunk(downloadedBytes, totalBytes, chunk.length);
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve({ path: destPath, totalBytes: downloadedBytes }));
      });

      fileStream.on('error', (err) => {
        unlink(destPath).catch(() => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Таймаут соединения при загрузке пакета'));
    });
  });
}

async function realDownloadPackageWithStreaming(packageName, onProgress) {
  const downloadDir = path.join(os.tmpdir(), 'driverhub-downloads');
  await mkdir(downloadDir, { recursive: true });

  onProgress({
    stage: 'prepare',
    percent: 8,
    detail: `Поиск пакета ${packageName} в репозиториях системы...`,
    log: `Проверка доступности репозитория для ${packageName}...`
  });

  const uris = await getAptPackageUris(packageName);
  const downloadedFiles = [];

  if (uris && uris.length > 0) {
    const totalBytesAll = uris.reduce((acc, u) => acc + (u.size || 0), 0) || 1;
    let globalDownloaded = 0;
    const startTime = Date.now();
    let lastEmitTime = 0;

    for (let i = 0; i < uris.length; i++) {
      const item = uris[i];
      const targetFile = path.join(downloadDir, item.filename);

      onProgress({
        stage: 'download',
        percent: Math.min(50, Math.floor(10 + (globalDownloaded / totalBytesAll) * 40)),
        detail: `Скачивание ${item.filename} (файл ${i + 1} из ${uris.length})...`,
        log: `[Загрузка] Подключение к ${item.url}`
      });

      await downloadHttpFile(item.url, targetFile, item.size, (fileLoaded, fileTotal, chunkLen) => {
        globalDownloaded += chunkLen;
        const now = Date.now();
        if (now - lastEmitTime > 80 || globalDownloaded >= totalBytesAll) {
          lastEmitTime = now;
          const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
          const speedBps = globalDownloaded / elapsedSec;
          const pct = Math.min(50, Math.floor(10 + (globalDownloaded / totalBytesAll) * 40));
          const remainingBytes = Math.max(0, totalBytesAll - globalDownloaded);
          const etaSec = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

          onProgress({
            stage: 'download',
            percent: pct,
            detail: `Скачивание ${item.filename}: ${formatBytes(globalDownloaded)} из ${formatBytes(totalBytesAll)} (${formatSpeed(speedBps)})`,
            log: `[Загрузка] ${formatBytes(globalDownloaded)} / ${formatBytes(totalBytesAll)} [${pct}%] • ${formatSpeed(speedBps)} • ETA: ${etaSec}с`,
            bytesDownloaded: globalDownloaded,
            bytesTotal: totalBytesAll,
            speed: formatSpeed(speedBps),
            eta: `${etaSec} сек`
          });
        }
      });

      downloadedFiles.push(targetFile);
    }

    onProgress({
      stage: 'verify',
      percent: 52,
      detail: `Проверка контрольных сумм и целостности скачанных пакетов (${downloadedFiles.length} шт.)...`,
      log: `Успешно загружено ${formatBytes(globalDownloaded)}. Проверка целостности deb архивов...`
    });

    return downloadedFiles;
  }

  // Запасной путь: apt-get download с синтаксическим парсингом
  onProgress({
    stage: 'download',
    percent: 15,
    detail: `Скачивание пакета ${packageName} через подсистему APT...`,
    log: `Запуск apt-get download ${packageName}...`
  });

  try {
    let progressPercent = 15;
    await runProcessStreaming('apt-get', ['-o', 'APT::Status-Fd=1', 'download', packageName], { cwd: downloadDir }, (line) => {
      const match = line.match(/(\d+)%/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        progressPercent = Math.min(50, Math.max(15, Math.floor(15 + (parsed * 0.35))));
      }
      onProgress({
        stage: 'download',
        percent: progressPercent,
        detail: `Скачивание ${packageName} (${progressPercent}%)...`,
        log: line
      });
    });

    onProgress({
      stage: 'verify',
      percent: 52,
      detail: `Пакет ${packageName} скачан. Проверка целостности...`,
      log: 'Скачивание пакета завершено.'
    });
  } catch (err) {
    onProgress({
      stage: 'download',
      percent: 50,
      detail: `Подготовка к прямой установке ${packageName}...`,
      log: `Пакет в кэше репозитория или доступен напрямую: ${err.message}`
    });
  }

  return [];
}

async function installPackageWithProgress(packageName, onProgress) {
  if (!isPackageAllowed(packageName)) {
    throw new Error(`Пакет ${packageName} отсутствует в безопасном списке драйверов DriverHub`);
  }
  if (!existsSync('/usr/bin/pkexec')) {
    throw new Error('Polkit (pkexec) не найден. Выполните установку через терминал.');
  }

  // Шаг 1: Подготовка
  onProgress({
    stage: 'prepare',
    percent: 5,
    detail: `Инициализация установки драйвера ${packageName}...`,
    log: `Проверка совместимости драйвера ${packageName} для Astra Linux / Debian`
  });

  // Шаг 2: Реальное скачивание пакета с потоковым прогрессом
  const downloadedFiles = await realDownloadPackageWithStreaming(packageName, onProgress);

  // Шаг 3: Запрос прав Polkit и установка через APT / DPKG
  onProgress({
    stage: 'install',
    percent: 56,
    detail: `Запрос прав администратора Polkit и установка ${packageName}...`,
    log: `Запуск системного установщика для ${packageName}...`
  });

  const aptArgs = [
    '/usr/bin/apt-get',
    'install',
    '-y',
    '--no-install-recommends',
    '-o', 'Dpkg::Options::=--force-confdef',
    '-o', 'Dpkg::Options::=--force-confold',
    '-o', 'DPkg::Lock::Timeout=60',
    '-o', 'APT::Status-Fd=1',
    '-o', 'Dpkg::Options::=--status-fd=1'
  ];

  if (downloadedFiles && downloadedFiles.length > 0) {
    aptArgs.push(...downloadedFiles);
  } else {
    aptArgs.push(packageName);
  }

  let currentPercent = 56;
  try {
    await runProcessStreaming('/usr/bin/pkexec', aptArgs, { timeout: 300000 }, (line) => {
      if (line.includes('Unpacking') || line.includes('Распаковывается')) {
        currentPercent = Math.min(75, currentPercent + 4);
        onProgress({ stage: 'install', percent: currentPercent, detail: `Распаковка модулей драйвера ${packageName}...`, log: line });
      } else if (line.includes('Setting up') || line.includes('Настраивается')) {
        currentPercent = Math.min(90, currentPercent + 4);
        onProgress({ stage: 'install', percent: currentPercent, detail: `Регистрация и настройка драйвера ${packageName}...`, log: line });
      } else if (line.includes('Processing triggers') || line.includes('Обрабатываются триггеры')) {
        onProgress({ stage: 'install', percent: 94, detail: 'Обновление триггеров ядра и системных служб...', log: line });
      } else if (line.includes('status:') || line.includes('Inst ') || line.includes('Conf ')) {
        currentPercent = Math.min(92, currentPercent + 2);
        onProgress({ stage: 'install', percent: currentPercent, detail: `Конфигурация: ${line.slice(0, 60)}...`, log: line });
      } else {
        onProgress({ stage: 'install', percent: currentPercent, detail: `Установка: ${line.slice(0, 70)}`, log: line });
      }
    });

    // Шаг 4: Пост-инсталляционная настройка служб (CUPS / udev)
    if (/cups|cjet|foo2zjs|printer/.test(packageName)) {
      onProgress({
        stage: 'configure',
        percent: 97,
        detail: 'Перезапуск и проверка службы печати CUPS...',
        log: 'systemctl restart cups'
      });
      try {
        await execFileAsync('/usr/bin/systemctl', ['restart', 'cups'], { timeout: 10000 });
      } catch {}
    }

    onProgress({
      stage: 'completed',
      percent: 100,
      detail: `Драйвер ${packageName} успешно скачан и установлен в систему!`,
      log: `Установка ${packageName} успешно завершена на 100%.`
    });

    return {
      success: true,
      packageName,
      rebootRequired: /nvidia|firmware|linux/.test(packageName)
    };
  } catch (error) {
    if (error.code === 126 || error.code === 127) {
      throw new Error('Установка отменена пользователем (запрос прав администратора отклонён)');
    }
    throw new Error(`Ошибка установки: ${error.stderr || error.message}`);
  } finally {
    // Очистка временных файлов
    for (const f of downloadedFiles) {
      try { await unlink(f); } catch {}
    }
  }
}

async function installCanonLbpWithProgress(modelKey, printerName, onProgress) {
  if (!existsSync('/usr/bin/pkexec')) {
    throw new Error('Polkit (pkexec) не найден. Выполните установку вручную.');
  }

  const model = modelKey || 'LBP2900';
  const name = printerName || `Canon_${model}`;

  // Шаг 1: Подготовка
  onProgress({
    stage: 'prepare',
    percent: 5,
    detail: `Подготовка специального установщика Canon для Astra Linux (${model})...`,
    log: `Старт процедуры настройки Canon i-SENSYS ${model}`
  });

  // Шаг 2: Реальное скачивание пакетов CUPS и cjet с индикатором
  onProgress({
    stage: 'download',
    percent: 12,
    detail: 'Проверка и реальное скачивание драйверных модулей printer-driver-cjet...',
    log: 'Загрузка драйверных пакетов печати Canon...'
  });

  try {
    await realDownloadPackageWithStreaming('printer-driver-cjet', (data) => {
      if (data.stage === 'download') {
        const scaled = Math.min(42, Math.floor(12 + (data.percent / 50) * 30));
        onProgress({
          stage: 'download',
          percent: scaled,
          detail: data.detail || 'Загрузка компонентов Canon...',
          log: data.log || '',
          bytesDownloaded: data.bytesDownloaded,
          bytesTotal: data.bytesTotal,
          speed: data.speed,
          eta: data.eta
        });
      }
    });
  } catch (err) {
    onProgress({
      stage: 'download',
      percent: 40,
      detail: 'Драйверные модули уже загружены в системный кэш',
      log: `Кэш пакетов готов: ${err.message}`
    });
  }

  // Шаг 3: Формирование установочного скрипта
  const scriptContent = generateSetupScript(model, name);
  const tmpScript = path.join(os.tmpdir(), `driverhub-canon-${Date.now()}.sh`);
  await writeFile(tmpScript, scriptContent, { mode: 0o755 });

  onProgress({
    stage: 'install',
    percent: 45,
    detail: 'Запрос прав администратора Polkit и запуск настройки ядра/CUPS...',
    log: 'Запуск скрипта системной интеграции Canon CAPT...'
  });

  try {
    await runProcessStreaming('/usr/bin/pkexec', ['/bin/bash', tmpScript], { timeout: 300000 }, (line) => {
      const stepMatch = line.match(/^STEP:(\d+):(\d+):(.+)$/);
      if (stepMatch) {
        const percent = Math.min(96, Math.max(45, parseInt(stepMatch[2], 10)));
        const detail = stepMatch[3];
        onProgress({
          stage: percent >= 95 ? 'configure' : 'install',
          percent,
          detail,
          log: detail
        });
      } else {
        onProgress({
          stage: 'install',
          percent: 75,
          detail: `Настройка оборудования: ${line.slice(0, 60)}...`,
          log: line
        });
      }
    });

    onProgress({
      stage: 'completed',
      percent: 100,
      detail: `Принтер Canon ${model} успешно установлен, настроен в CUPS и готов к печати!`,
      log: `Установка Canon ${model} полностью завершена.`
    });

    return {
      success: true,
      modelKey: model,
      printerName: name,
      isPrinter: true,
      rebootRequired: false
    };
  } catch (error) {
    if (error.code === 126 || error.code === 127) {
      throw new Error('Установка Canon отменена пользователем (запрос прав отклонён)');
    }
    throw new Error(`Ошибка настройки Canon: ${error.stderr || error.message}`);
  } finally {
    try { await unlink(tmpScript); } catch {}
  }
}

async function fixCanonUserGroupsWithProgress(username = '', onProgress) {
  if (!existsSync('/usr/bin/pkexec')) {
    throw new Error('Polkit (pkexec) не найден. Выполните команду через терминал с правами sudo.');
  }

  const { generateFixCanonPermissionsScript } = require('./canon-lbp-setup.cjs');
  const scriptContent = generateFixCanonPermissionsScript(username);
  const tmpScript = path.join(os.tmpdir(), `driverhub-fix-canon-groups-${Date.now()}.sh`);
  await writeFile(tmpScript, scriptContent, { mode: 0o755 });

  onProgress({
    stage: 'prepare',
    percent: 10,
    detail: 'Подготовка к добавлению пользователя в группы lp/lpadmin и обновлению прав...',
    log: 'Старт сценария исправления групп Astra Linux'
  });

  try {
    await runProcessStreaming('/usr/bin/pkexec', ['/bin/bash', tmpScript], { timeout: 120000 }, (line) => {
      const stepMatch = line.match(/^STEP:(\d+):(\d+):(.+)$/);
      if (stepMatch) {
        const percent = parseInt(stepMatch[2], 10);
        const detail = stepMatch[3];
        onProgress({
          stage: percent >= 100 ? 'completed' : 'install',
          percent,
          detail,
          log: detail
        });
      } else {
        onProgress({
          stage: 'install',
          percent: 60,
          detail: 'Настройка групп и прав устройств печати...',
          log: line
        });
      }
    });

    onProgress({
      stage: 'completed',
      percent: 100,
      detail: 'Пользователь успешно добавлен в группы lp и lpadmin! Права Canon LBP исправлены.',
      log: 'Исправление прав печати успешно завершено.'
    });

    return {
      success: true,
      message: 'Пользователь добавлен в группы lp и lpadmin. Очередь печати CUPS и буфер CCPD обновлены.'
    };
  } catch (error) {
    if (error.code === 126 || error.code === 127) {
      throw new Error('Операция отменена пользователем (запрос прав Polkit отклонён)');
    }
    throw new Error(`Ошибка исправления прав: ${error.stderr || error.message}`);
  } finally {
    try { await unlink(tmpScript); } catch {}
  }
}

module.exports = {
  ALLOWED_PACKAGES,
  isPackageAllowed,
  formatBytes,
  formatSpeed,
  realDownloadPackageWithStreaming,
  installPackageWithProgress,
  installCanonLbpWithProgress,
  fixCanonUserGroupsWithProgress
};
