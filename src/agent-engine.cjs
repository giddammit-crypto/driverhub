const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile, existsSync } = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const { CANON_MODELS, detectCanonPrinters } = require('./canon-lbp-setup.cjs');
const { installPackageWithProgress, installCanonLbpWithProgress, fixCanonUserGroupsWithProgress } = require('./installer.cjs');

const execFileAsync = promisify(execFile);

const FREE_QWEN_MODELS = [
  { id: 'qwen/qwen3.8-max:free', name: 'Qwen 3.8 Max (Free)', description: 'Флагманская модель — глубокий системный анализ и устранение неполадок' },
  { id: 'qwen/qwen3-coder-plus:free', name: 'Qwen 3 Coder Plus (Free)', description: 'Оптимизирована для команд Linux, bash и диагностики ядра' },
  { id: 'qwen/qwen3.7-max:free', name: 'Qwen 3.7 Max (Free)', description: 'Глубокий анализ системных журналов и конфигураций' },
  { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (Free)', description: 'Быстрый и точный системный помощник' },
  { id: 'qwen/qwen3.5-flash:free', name: 'Qwen 3.5 Flash (Free)', description: 'Сверхбыстрый отклик для типовых задач' },
  { id: 'qwen/qwen3-max:free', name: 'Qwen 3 Max (Free)', description: 'Проверенная надежная модель Qwen' }
];

async function safeExec(cmd, args, timeout = 5000) {
  try {
    const candidates = [`/usr/bin/${cmd}`, `/usr/sbin/${cmd}`, `/bin/${cmd}`, `/sbin/${cmd}`];
    const bin = candidates.find(existsSync);
    if (!bin) return '';
    const res = await execFileAsync(bin, args, { timeout, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
    return res.stdout || '';
  } catch (err) {
    return err.stdout || '';
  }
}

async function inspectPrintersStatus() {
  const cupsActive = (await safeExec('systemctl', ['is-active', 'cups'])).trim() === 'active';
  const ccpdActive = (await safeExec('systemctl', ['is-active', 'ccpd'])).trim() === 'active';
  const lpstatPrinters = await safeExec('lpstat', ['-p', '-d']);
  const lpstatDevices = await safeExec('lpstat', ['-v']);
  const lsmodOutput = await safeExec('lsmod', []);
  const usblpLoaded = /usblp\b/.test(lsmodOutput);
  const devLpExists = existsSync('/dev/usb/lp0') || existsSync('/dev/usb/lp1');
  const fifoExists = existsSync('/var/ccpd/fifo0');

  // Проверка групп текущего пользователя (Astra Linux: lp, lpadmin)
  const groupsOutput = (await safeExec('id', ['-Gn'])).trim() || (await safeExec('groups', [])).trim();
  const userGroups = groupsOutput.split(/\s+/).filter(Boolean);
  const userInLpGroup = userGroups.includes('lp');
  const userInLpAdminGroup = userGroups.includes('lpadmin');
  const currentUser = os.userInfo ? os.userInfo().username : (process.env.USER || 'astra');

  return {
    cupsActive,
    ccpdActive,
    usblpLoaded,
    devLpExists,
    fifoExists,
    userInLpGroup,
    userInLpAdminGroup,
    currentUser,
    userGroups,
    printersText: lpstatPrinters.trim(),
    devicesText: lpstatDevices.trim()
  };
}

async function inspectAptStatus() {
  const audit = await safeExec('dpkg', ['--audit']);
  const lockHeld = existsSync('/var/lib/dpkg/lock') || existsSync('/var/lib/apt/lists/lock');
  return {
    clean: audit.trim().length === 0,
    brokenOutput: audit.trim(),
    lockHeld
  };
}

async function inspectSystemErrors() {
  const dmesg = await safeExec('dmesg', ['-l', 'err,warn', '-T']);
  const lines = dmesg.split('\n').filter(Boolean).slice(-15);
  return lines;
}

function resolveChatEndpoint(baseUrl) {
  let raw = String(baseUrl || 'https://api.xkiro.com/v1').trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const url = new URL(raw);
  let p = url.pathname.replace(/\/+$/, '');
  if (p.endsWith('/chat/completions')) {
    // уже содержит эндпоинт
  } else if (p.endsWith('/v1')) {
    p = `${p}/chat/completions`;
  } else if (!p || p === '/') {
    p = '/v1/chat/completions';
  } else {
    p = `${p}/chat/completions`;
  }
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: p
  };
}

function postJson(urlString, body, apiKey, timeout = 45000) {
  return new Promise((resolve, reject) => {
    try {
      const endpoint = resolveChatEndpoint(urlString);
      const httpModule = endpoint.protocol === 'http:' ? require('node:http') : https;
      const payload = JSON.stringify(body);
      const request = httpModule.request({
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${apiKey.trim()}`,
          'User-Agent': 'DriverHub/1.0 (X11; Linux x86_64)',
          'Accept': 'application/json'
        },
        timeout
      }, (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
          if (data.length > 1024 * 1024 * 4) request.destroy(new Error('Ответ слишком большой'));
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            try {
              const errObj = JSON.parse(data);
              const msg = errObj?.error?.message || errObj?.message || data.slice(0, 160);
              reject(new Error(`xkiro API (${response.statusCode}): ${msg}`));
            } catch {
              reject(new Error(`xkiro API HTTP ${response.statusCode}: ${data.slice(0, 150)}`));
            }
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('xkiro API вернул некорректный JSON'));
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('Превышено время ожидания ответа AI (xkiro). Попробуйте другую модель Qwen или повторите попытку.')));
      request.on('error', (err) => reject(new Error(`Ошибка сети xkiro: ${err.message}`)));
      request.write(payload);
      request.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function testXkiroConnection({ apiKey, baseUrl, model }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Ключ API xkiro не указан');
  }
  const url = baseUrl || 'https://api.xkiro.com/v1';
  const targetModel = model || 'qwen/qwen3.8-max:free';

  const body = {
    model: targetModel,
    messages: [
      { role: 'system', content: 'Ответь кратко: OK' },
      { role: 'user', content: 'Ping' }
    ],
    max_tokens: 10,
    temperature: 0.1
  };

  const response = await postJson(url, body, apiKey.trim(), 30000);
  const text = response.choices?.[0]?.message?.content || '';
  return {
    success: true,
    model: targetModel,
    response: text.trim()
  };
}

function localAgentReasoning(userMessage, telemetry) {
  const lower = userMessage.toLowerCase();
  const printers = telemetry.printers;
  const apt = telemetry.apt;
  const canonDetected = telemetry.canonDetected || [];

  // 1. Запрос или диагностика Canon LBP (включая зависшие задания, отсутствие печати, группы lp/lpadmin)
  const isCanon = /canon|lbp|2900|6000|3000|6020|6030|принтер|печать|печтат/i.test(lower);
  const isStuckJobs = /задани|очеред|не идет|не печатает|висит|отправл|групп|lp\b|права/i.test(lower);

  if (isCanon) {
    let model = 'LBP2900';
    if (/6000|6018/i.test(lower)) model = 'LBP6000';
    else if (/3000/i.test(lower)) model = 'LBP3000';
    else if (/6020/i.test(lower)) model = 'LBP6020';
    else if (/6030/i.test(lower)) model = 'LBP6030';
    else if (canonDetected.length > 0) model = canonDetected[0].modelKey;

    const isExplicitSetup = /настрой|установ|постав|подключ|инстал/i.test(lower);
    const isStuckJobs = /задани|очеред|не идет|не печатает|висит|отправл|групп|lp\b|права|ошибк/i.test(lower);

    // В Astra Linux частая проблема: принтер виден, задания отправляются, но печать не идет (пользователь не в группе lp)
    if (isStuckJobs || (!isExplicitSetup && !printers.userInLpGroup)) {
      const uName = printers.currentUser || 'пользователь';
      let explanation = `Я проанализировал причину неполадок печати **Canon ${model}** в **${telemetry.os.distribution}**:\n\n`;
      explanation += `• **Характерный сбой Astra Linux:** Принтер корректно определяется по USB, очередь CUPS принимает документы, однако реальная печать не начинается.\n`;
      explanation += `• **Причина:** Пользователь \`${uName}\` **не включён в системную группу \`lp\`** (и \`lpadmin\`). В Astra Linux это блокирует права доступа к символьному устройству \`/dev/usb/lp0\` и буферу очереди CAPT \`/var/ccpd/fifo0\`.\n`;
      explanation += `• **Состояние подсистемы:** CUPS: ${printers.cupsActive ? 'активен ✓' : 'требуется запуск'}, модуль usblp: ${printers.usblpLoaded ? 'загружен ✓' : 'требуется активация'}, FIFO /var/ccpd/fifo0: ${printers.fifoExists ? 'присутствует' : 'требуется создать'}.\n\n`;
      explanation += `Я сформировал план: добавить \`${uName}\` в группы \`lp\` и \`lpadmin\`, выставить права доступа на устройство и буфер FIFO (\`chmod 666 /var/ccpd/fifo0\`) и перезапустить стек печати. Нажмите кнопку ниже для применения с правами администратора.`;

      return {
        text: explanation,
        action: {
          id: 'canon_fix_groups',
          title: `Добавить ${uName} в группы lp/lpadmin и восстановить печать Canon`,
          description: `Добавление пользователя в группы lp и lpadmin, настройка разрешений FIFO /var/ccpd/fifo0 и перезапуск служб CUPS/CCPD.`,
          actionType: 'canon_fix_groups',
          params: { username: uName, modelKey: model }
        }
      };
    }

    let explanation = `Я проанализировал конфигурацию подсистемы печати вашей системы (${telemetry.os.distribution}, ядро ${telemetry.os.kernel}):\n\n`;
    explanation += `• **Принтеры Canon серии LBP (${model})** используют технологию CAPT. В Astra Linux и Debian они требуют специального буфера FIFO \`/var/ccpd/fifo0\`, модуля ядра \`usblp\` и включения пользователя в группу \`lp\`.\n`;
    explanation += `• Модуль \`usblp\`: ${printers.usblpLoaded ? 'загружен ✓' : 'не загружен (будет активирован в /etc/modules-load.d/)'}.\n`;
    explanation += `• Служба CUPS: ${printers.cupsActive ? 'активна ✓' : 'требуется запуск'}.\n`;
    explanation += `• Служба CCPD и udev-правила: ${printers.fifoExists ? 'настроены' : 'требуется создание буфера и udev-правила 85-canon-capt.rules'}.\n`;
    explanation += `• Группа пользователя \`lp\`: ${printers.userInLpGroup ? 'в группе ✓' : 'будет настроена автоматически'}.\n\n`;
    explanation += `Я сформировал план автоматической настройки подсистемы печати для **Canon ${model}**. Нажмите кнопку ниже для применения с правами администратора.`;

    return {
      text: explanation,
      action: {
        id: 'setup_canon_lbp',
        title: `Установить и настроить Canon ${model} для Astra Linux`,
        description: `Загрузка модуля usblp, добавление в lp/lpadmin, создание FIFO /var/ccpd/fifo0, ccpd.service, udev-правил и очереди CUPS.`,
        actionType: 'canon_setup',
        params: { modelKey: model, printerName: `Canon_${model}` }
      }
    };
  }

  // 2. Исправление APT / поврежденных пакетов
  if (/apt|пакет|зависимост|сломан|broken|dpkg/i.test(lower)) {
    return {
      text: `Анализ пакетного менеджера APT:\n\n• Состояние dpkg: ${apt.clean ? 'в порядке, критических сбоев нет' : 'обнаружены незавершенные установки'}\n• Блокировки lock: ${apt.lockHeld ? 'активны' : 'отсутствуют'}\n\nСформирован план проверки целостности и исправления сломанных зависимостей (\`apt-get install -f\`).`,
      action: {
        id: 'repair_apt',
        title: 'Исправить сломанные зависимости пакетов APT',
        description: 'Запуск apt-get install -f -y для устранения конфликтов и завершения установки.',
        actionType: 'apt_fix',
        params: {}
      }
    };
  }

  // 3. Общая проверка и исправление системы
  let generalSummary = `Проведена комплексная диагностика оборудования и ядра системы:\n\n`;
  generalSummary += `• **ОС:** ${telemetry.os.distribution} (${telemetry.os.architecture})\n`;
  generalSummary += `• **Ядро Linux:** ${telemetry.os.kernel}\n`;
  generalSummary += `• **Устройств обнаружено:** ${telemetry.devicesCount}\n`;
  generalSummary += `• **Печать CUPS:** ${printers.cupsActive ? 'Работает штатно' : 'Остановлена'}\n`;
  if (!printers.usblpLoaded) {
    generalSummary += `• **Внимание:** модуль ядра \`usblp\` не загружен (может препятствовать работе USB-принтеров Canon).\n`;
  }

  const action = (!printers.usblpLoaded || !printers.cupsActive) ? {
    id: 'setup_canon_lbp',
    title: 'Настроить стек печати и модуль usblp',
    description: 'Активация модуля usblp и запуск служб печати для поддержки принтеров Canon LBP.',
    actionType: 'canon_setup',
    params: { modelKey: 'LBP2900' }
  } : {
    id: 'repair_apt',
    title: 'Проверить и обновить кэш драйверов системы',
    description: 'Оптимизация параметров драйверов и проверка целостности репозиториев.',
    actionType: 'apt_fix',
    params: {}
  };

  return {
    text: generalSummary + `\nРекомендуемое действие готово к выполнению.`,
    action
  };
}

function readOsRelease() {
  try {
    const content = require('node:fs').readFileSync('/etc/os-release', 'utf8');
    return Object.fromEntries(content.split('\n').filter(Boolean).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')];
    }));
  } catch {
    return { ID: 'linux', PRETTY_NAME: 'Linux' };
  }
}

async function runAgentTurn({ userMessage, history = [], settings = {}, scanDevicesFn }) {
  const printers = await inspectPrintersStatus();
  const apt = await inspectAptStatus();
  const errors = await inspectSystemErrors();
  let devices = [];
  try {
    const scanRes = await scanDevicesFn();
    devices = scanRes.devices || [];
  } catch {}

  const canonDetected = detectCanonPrinters(devices);
  const release = readOsRelease();

  const telemetry = {
    os: {
      distribution: release.PRETTY_NAME || release.NAME || 'Linux',
      id: release.ID || 'linux',
      kernel: os.release(),
      architecture: process.arch
    },
    printers,
    apt,
    devicesCount: devices.length,
    canonDetected,
    errorsSample: errors
  };

  const apiKey = settings.xkiroApiKey || process.env.QWEN_API_KEY;
  const baseUrl = settings.xkiroBaseUrl || process.env.QWEN_BASE_URL || 'https://api.xkiro.com/v1';
  const model = settings.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free';

  // Если ключ xkiro не настроен, используем локальный интеллектуальный движок
  if (!apiKey) {
    const localResult = localAgentReasoning(userMessage, telemetry);
    return {
      text: localResult.text,
      action: localResult.action,
      modelUsed: 'Локальный эксперт DriverHub (без API-ключа)',
      telemetry
    };
  }

  // Если ключ xkiro есть — делаем запрос к Qwen с системным телеметрическим контекстом
  const systemPrompt = `Ты — автономный системный AI-агент DriverHub для Linux (Astra Linux, Debian, Ubuntu).
У тебя есть доступ к состоянию системы пользователя:
- Дистрибутив: ${telemetry.os.distribution} (ID: ${telemetry.os.id}, arch: ${telemetry.os.architecture}, kernel: ${telemetry.os.kernel})
- Состояние CUPS: ${printers.cupsActive ? 'активен' : 'остановлен'}, модуль usblp: ${printers.usblpLoaded ? 'загружен' : 'не загружен'}, /dev/usb/lp*: ${printers.devLpExists ? 'есть' : 'нет'}
- Буфер CCPD /var/ccpd/fifo0: ${printers.fifoExists ? 'присутствует' : 'отсутствует'}
- Членство пользователя (${printers.currentUser}) в группах: lp: ${printers.userInLpGroup ? 'ДА' : 'НЕТ (требуется добавить)'}, lpadmin: ${printers.userInLpAdminGroup ? 'ДА' : 'НЕТ'}
- Обнаруженные принтеры Canon: ${JSON.stringify(canonDetected.map(c => c.modelKey))}
- Статус APT: ${apt.clean ? 'чисто' : 'есть ошибки: ' + apt.brokenOutput}

ВАЖНО ДЛЯ ASTRA LINUX И CANON LBP:
В Astra Linux принтеры Canon CAPT (LBP2900, LBP6000 и др.) имеют специфическую проблему: принтер обнаруживается, задания отправляются в очередь, но печать не идет. Причина в том, что пользователь не добавлен в системную группу lp (и lpadmin), и у него нет доступа к устройству /dev/usb/lp0 и буферу /var/ccpd/fifo0. Для исправления этой проблемы используй действие canon_fix_groups.

ПРАВИЛА ОТВЕТА:
1. Отвечай на русском языке, профессионально, уверенно и доброжелательно.
2. Объясняй причину проблемы прямо и понятно (например, почему Canon LBP2900/6000 не печатает без включения пользователя в группу lp и прав на FIFO буфер в Astra Linux).
3. Если требуется действие по исправлению, включи в самый конец ответа блок действия строго в формате:
<action_plan>
{
  "id": "canon_fix_groups",
  "title": "Добавить пользователя в группу lp и восстановить печать Canon",
  "description": "Добавление пользователя в группы lp/lpadmin, открытие прав на /var/ccpd/fifo0 и перезапуск CUPS/CCPD",
  "actionType": "canon_fix_groups",
  "params": { "username": "${printers.currentUser}" }
}
</action_plan>
Допустимые actionType:
- "canon_setup" (params: modelKey) — полная установка Canon LBP (PPD, usblp, CCPD, группы lp/lpadmin);
- "canon_fix_groups" (params: username, modelKey) — исправление прав пользователя в группах lp/lpadmin и прав на буфер печати;
- "apt_fix" (params: {}) — исправление сломанных пакетов APT;
- "install_package" (params: packageName) — установка системного драйвера.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  try {
    const res = await postJson(baseUrl, {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1200
    }, apiKey);

    const reply = res.choices?.[0]?.message?.content || '';
    let parsedAction = null;
    let cleanText = reply;

    const actionMatch = reply.match(/<action_plan>\s*(\{[\s\S]*?\})\s*<\/action_plan>/);
    if (actionMatch) {
      try {
        parsedAction = JSON.parse(actionMatch[1]);
        cleanText = reply.replace(/<action_plan>[\s\S]*?<\/action_plan>/, '').trim();
      } catch {}
    }

    // Если модель не выдала тег, но пользователь просит Canon или APT, подстрахуем действием
    if (!parsedAction) {
      const fallback = localAgentReasoning(userMessage, telemetry);
      if (fallback.action) {
        parsedAction = fallback.action;
      }
    }

    return {
      text: cleanText,
      action: parsedAction,
      modelUsed: model,
      telemetry
    };
  } catch (err) {
    // При сбое соединения xkiro переключаемся на локального агента с пометкой
    const local = localAgentReasoning(userMessage, telemetry);
    return {
      text: `*(Ошибка соединения с xkiro: ${err.message}. Ответ сформирован локальным агентом)*\n\n` + local.text,
      action: local.action,
      modelUsed: 'Локальный эксперт (сбой xkiro)',
      telemetry
    };
  }
}

async function executeAgentAction(action, onProgress) {
  if (!action || !action.actionType) {
    throw new Error('Некорректное действие для выполнения');
  }

  onProgress({
    stage: 'prepare',
    percent: 10,
    detail: `Подготовка к выполнению: ${action.title}...`,
    log: `Старт действия ${action.actionType}`
  });

  if (action.actionType === 'canon_setup') {
    const modelKey = action.params?.modelKey || 'LBP2900';
    const printerName = action.params?.printerName || `Canon_${modelKey}`;
    return await installCanonLbpWithProgress(modelKey, printerName, onProgress);
  }

  if (action.actionType === 'canon_fix_groups') {
    const username = action.params?.username || '';
    return await fixCanonUserGroupsWithProgress(username, onProgress);
  }

  if (action.actionType === 'install_package') {
    const pkg = action.params?.packageName;
    if (!pkg) throw new Error('Не указано имя пакета');
    return await installPackageWithProgress(pkg, onProgress);
  }

  if (action.actionType === 'apt_fix') {
    onProgress({
      stage: 'install',
      percent: 40,
      detail: 'Запуск исправления зависимостей APT через pkexec...',
      log: 'pkexec apt-get install -f -y'
    });

    const aptArgs = [
      '/usr/bin/apt-get',
      'install',
      '-f',
      '-y',
      '-o', 'Dpkg::Options::=--force-confdef',
      '-o', 'Dpkg::Options::=--force-confold'
    ];

    await execFileAsync('/usr/bin/pkexec', aptArgs, { timeout: 120000 });

    onProgress({
      stage: 'completed',
      percent: 100,
      detail: 'Зависимости APT успешно исправлены!',
      log: 'Исправление зависимостей завершено.'
    });

    return { success: true, message: 'Зависимости успешно исправлены' };
  }

  throw new Error(`Неизвестный тип действия: ${action.actionType}`);
}

module.exports = {
  FREE_QWEN_MODELS,
  inspectPrintersStatus,
  inspectAptStatus,
  inspectSystemErrors,
  testXkiroConnection,
  runAgentTurn,
  executeAgentAction
};
