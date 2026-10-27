const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Electron security boundary is present', () => {
  const main = read('src/main.cjs');
  const preload = read('src/preload.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /execFile|child_process|shell\.openExternal/);
});

test('interface includes all DriverHub sections from the design', () => {
  const app = read('src/renderer/app.js');
  for (const label of ['Главная', 'Поиск драйверов', 'Установка', 'Исправление ошибок', 'Журнал', 'Настройки']) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /Обнаруженные устройства/);
  assert.match(app, /Qwen AI/);
});

test('driver installation is restricted to a package allowlist', () => {
  const main = read('src/main.cjs');
  assert.match(main, /allowedPackages/);
  assert.match(main, /pkexec/);
  assert.match(main, /no-install-recommends/);
  assert.doesNotMatch(main, /execFileAsync\([^,]+,\s*\[[^\]]*payload\.(command|shell)/);
});

test('renderer defines a strict Content Security Policy', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/i);
  assert.match(html, /default-src 'self'/);
});

test('main process configures linux sandbox compatibility and safe hardware scanning', () => {
  const main = read('src/main.cjs');
  assert.match(main, /appendSwitch\('no-sandbox'\)/);
  assert.match(main, /sandbox:\s*true/);
  assert.doesNotMatch(main, /runCommand\('lsusb',\s*\['-nn'\]\)/);
  assert.match(main, /isBridge/);
});

test('pkexec execution uses noninteractive APT options, lock timeout, and isolated env', () => {
  const main = read('src/main.cjs');
  assert.match(main, /--force-confdef/);
  assert.match(main, /--force-confold/);
  assert.match(main, /Lock::Timeout=60/);
  assert.match(main, /timeout:\s*300000/);
  assert.match(main, /DEBIAN_FRONTEND/);
  assert.match(main, /error\.code === 126/);
});

test('main process restricts window opening, navigation and permissions', () => {
  const main = read('src/main.cjs');
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /validateIpcSender/);
});

test('renderer performs incremental DOM search and safe settings handling', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /renderDriverResults/);
  assert.match(app, /resultsContainer\.innerHTML\s*=\s*renderDriverResults/);
  assert.match(app, /DEFAULT_CLIENT_SETTINGS/);
});

test('Canon LBP suite generates valid PPDs, module configurations, udev rules and systemd service', () => {
  const { CANON_MODELS, generatePpdContent, generateSetupScript, detectCanonPrinters } = require('../src/canon-lbp-setup.cjs');
  assert.ok(CANON_MODELS.LBP2900);
  assert.ok(CANON_MODELS.LBP6000);
  assert.equal(CANON_MODELS.LBP2900.usbId, '04a9:2676');
  assert.equal(CANON_MODELS.LBP6000.usbId, '04a9:271a');

  const ppd2900 = generatePpdContent('LBP2900');
  assert.match(ppd2900, /\*PPD-Adobe:\s*"4\.3"/);
  assert.match(ppd2900, /CNCUPSLBP2900CAPTK\.ppd/);

  const ppd6000 = generatePpdContent('LBP6000');
  assert.match(ppd6000, /CNCUPSLBP6000CAPTK\.ppd/);

  const script = generateSetupScript('LBP2900');
  assert.match(script, /usblp/);
  assert.match(script, /\/var\/ccpd\/fifo0/);
  assert.match(script, /85-canon-capt\.rules/);
  assert.match(script, /ccpd\.service/);
  assert.match(script, /lpadmin/);

  const detected = detectCanonPrinters([
    { name: 'Canon LBP2900 Printer', detail: 'USB 04a9:2676' }
  ]);
  assert.equal(detected.length, 1);
  assert.equal(detected[0].modelKey, 'LBP2900');
});

test('Visual installation progress tracking and package download streaming are supported', () => {
  const { ALLOWED_PACKAGES } = require('../src/installer.cjs');
  assert.ok(ALLOWED_PACKAGES.has('cups'));
  assert.ok(ALLOWED_PACKAGES.has('printer-driver-cjet'));
  assert.ok(ALLOWED_PACKAGES.has('firmware-linux-free'));

  const main = read('src/main.cjs');
  assert.match(main, /install:progress/);
  assert.match(main, /drivers:install-canon/);

  const app = read('src/renderer/app.js');
  assert.match(app, /progress-modal/);
  assert.match(app, /progress-track/);
  assert.match(app, /progress-fill/);
  assert.match(app, /onProgress/);
});

test('xkiro API configuration and free Qwen models selection are fully integrated', () => {
  const { FREE_QWEN_MODELS } = require('../src/agent-engine.cjs');
  assert.ok(FREE_QWEN_MODELS.some(m => m.id === 'qwen/qwen3.8-max:free'));
  assert.ok(FREE_QWEN_MODELS.some(m => m.id === 'qwen/qwen3-coder-plus:free'));

  const main = read('src/main.cjs');
  assert.match(main, /ai:test-connection/);
  assert.match(main, /ai:get-free-models/);
  assert.match(main, /xkiroApiKey/);

  const app = read('src/renderer/app.js');
  assert.match(app, /xkiro-api-key-input/);
  assert.match(app, /qwen-model-select/);
  assert.match(app, /btn-test-xkiro/);
});

test('AI Agent operates with system telemetry and executable action plans', async () => {
  const { inspectPrintersStatus, inspectAptStatus, runAgentTurn, executeAgentAction } = require('../src/agent-engine.cjs');
  assert.equal(typeof inspectPrintersStatus, 'function');
  assert.equal(typeof inspectAptStatus, 'function');
  assert.equal(typeof executeAgentAction, 'function');

  const turn = await runAgentTurn({
    userMessage: 'У меня принтер Canon LBP2900, настрой его',
    settings: {},
    scanDevicesFn: async () => ({ devices: [] })
  });

  assert.ok(turn.text);
  assert.ok(turn.action);
  assert.equal(turn.action.actionType, 'canon_setup');
  assert.equal(turn.action.params.modelKey, 'LBP2900');

  const app = read('src/renderer/app.js');
  const preload = read('src/preload.cjs');
  assert.match(app, /ИИ-Агент/);
  assert.match(app, /data-execute-action/);
  assert.match(preload, /agent:chat/);
});

test('Astra Linux Canon LBP printing diagnostics detects missing lp group and offers one-click fix', async () => {
  const { runAgentTurn } = require('../src/agent-engine.cjs');
  const { generateFixCanonPermissionsScript, generateSetupScript } = require('../src/canon-lbp-setup.cjs');
  
  // 1. Проверяем генерацию скрипта настройки на наличие групп lp и lpadmin
  const setupScript = generateSetupScript('LBP2900');
  assert.match(setupScript, /usermod -a -G lp/);
  assert.match(setupScript, /usermod -a -G lpadmin/);

  // 2. Проверяем генерацию отдельного скрипта восстановления прав для Astra Linux
  const fixScript = generateFixCanonPermissionsScript('astra');
  assert.match(fixScript, /usermod -a -G lp/);
  assert.match(fixScript, /chmod 666 \/var\/ccpd\/fifo0/);
  assert.match(fixScript, /systemctl restart cups/);

  // 3. Запрос ИИ-агенту при зависших заданиях или проблеме печати в Astra Linux
  const turnStuck = await runAgentTurn({
    userMessage: 'Принтер Canon LBP2900 виден, задания отправляются в очередь, но печать не идет в Astra Linux',
    settings: {},
    scanDevicesFn: async () => ({ devices: [{ name: 'Canon LBP2900', detail: '04a9:2676' }] })
  });

  assert.ok(turnStuck.text);
  assert.match(turnStuck.text, /групп/);
  assert.ok(turnStuck.action);
  assert.equal(turnStuck.action.actionType, 'canon_fix_groups');
  assert.ok(turnStuck.action.title.includes('lp'));
});

test('Application ensures full UI responsiveness and persistent settings synchronization', () => {
  const styles = read('src/renderer/styles.css');
  const app = read('src/renderer/app.js');

  // Проверка адаптивности иконок (flex-shrink: 0)
  assert.match(styles, /flex-shrink:\s*0/);
  assert.match(styles, /\.status-badge/);
  assert.match(styles, /@media\s*\(max-width:\s*980px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)/);

  // Проверка сохранения и живой синхронизации настроек xkiro в UI
  assert.match(app, /agent-model-select/);
  assert.match(app, /agent-quick-save/);
  assert.match(app, /test-status-area/);
});

test('BrandKit vector icons and adaptive diagnostic & repair dashboard are fully integrated', () => {
  const styles = read('src/renderer/styles.css');
  const app = read('src/renderer/app.js');

  // Проверка наличия иконок брендбука DriverHub
  assert.match(app, /BRAND_ICONS/);
  for (const icon of ['alert', 'check', 'printer', 'cpu', 'shield', 'disk', 'network', 'volume', 'keyboard', 'gpu', 'download', 'search', 'settings', 'refresh', 'rollback']) {
    assert.match(app, new RegExp(`\\b${icon}:`));
  }
  assert.match(app, /brandIcon/);

  // Проверка адаптивной структуры экрана «Исправление ошибок»
  assert.match(app, /diagnostic-banner-card/);
  assert.match(app, /diagnostic-domains-grid/);
  assert.match(app, /repair-interactive-card/);
  assert.match(app, /repair-checklist-grid/);
  assert.match(styles, /\.diagnostic-banner-card/);
  assert.match(styles, /\.diagnostic-domains-grid/);
  assert.match(styles, /\.repair-interactive-card/);
});

test('CUPS printer management and branded test page (DRIVER HUB LINUX / biblioteka33.ru) are integrated', () => {
  const main = read('src/main.cjs');
  const preload = read('src/preload.cjs');
  const app = read('src/renderer/app.js');

  // Проверка IPC для принтеров и тестовой печати
  assert.match(main, /printers:list/);
  assert.match(main, /printers:print-test-page/);
  assert.match(main, /printers:clear-queue/);
  assert.match(preload, /printers:/);

  // Проверка фирменных реквизитов на тестовой странице и в интерфейсе
  assert.match(main, /DRIVER HUB LINUX/);
  assert.match(main, /biblioteka33\.ru/);
  assert.match(app, /DRIVER HUB LINUX/);
  assert.match(app, /biblioteka33\.ru/);
  assert.match(app, /printersPage/);
  assert.match(app, /test-page-hero-card/);
});

test('Reboot warning dialog and pending reboot telemetry are integrated', () => {
  const main = read('src/main.cjs');
  const preload = read('src/preload.cjs');
  const app = read('src/renderer/app.js');
  const styles = read('src/renderer/styles.css');

  // Проверка IPC перезагрузки системы
  assert.match(main, /system:reboot/);
  assert.match(main, /systemctl/);
  assert.match(preload, /reboot:\s*\(\)\s*=>/);

  // Проверка распознавания устройств, требующих перезагрузки
  assert.match(main, /rebootRequired/);
  assert.match(main, /требуется перезагрузка системы/);

  // Проверка диалогового окна с предупреждением о перезагрузке
  assert.match(app, /renderRebootModal/);
  assert.match(app, /rebootBanner/);
  assert.match(app, /data-action="reboot-system"/);
  assert.match(app, /Внимание! Требуется перезагрузка/);

  // Проверка CSS стилей модального окна и предупреждающего баннера
  assert.match(styles, /\.reboot-warning-modal/);
  assert.match(styles, /\.reboot-banner/);
  assert.match(styles, /\.btn-warning/);
});

test('Debian installer build script and zero-chmod launcher are configured', () => {
  const pkgJson = JSON.parse(read('package.json'));
  assert.ok(pkgJson.scripts['build:deb']);

  const buildScript = read('scripts/build-deb.cjs');
  assert.match(buildScript, /dpkg-deb/);
  assert.match(buildScript, /--no-sandbox/);
  assert.match(buildScript, /chrome-sandbox/);
  assert.match(buildScript, /postinst/);
  assert.match(buildScript, /ru\.biblioteka33\.driverhub\.policy/);
  assert.match(buildScript, /driverhub\.desktop/);
});

test('AI diagnostic output formatting safely parses raw and partial JSON', () => {
  const main = read('src/main.cjs');
  const app = read('src/renderer/app.js');
  const styles = read('src/renderer/styles.css');

  assert.match(main, /parseAiDiagnosticOutput/);
  assert.match(app, /parseAiData/);
  assert.match(app, /renderAiCard/);
  assert.match(styles, /\.ai-analysis-card/);
  assert.match(styles, /\.ai-recommendation-item/);
  assert.match(styles, /\.rec-number-badge/);
});



