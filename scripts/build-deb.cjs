const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

const VERSION = pkg.version || '0.1.0';
const APP_NAME = pkg.name || 'driverhub';
const ARCH = 'amd64';
const BUILD_DIR = path.join(PROJECT_ROOT, 'build', 'deb');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const OUTPUT_DEB = path.join(DIST_DIR, `${APP_NAME}_${VERSION}_${ARCH}.deb`);

console.log(`=== Сборка deb-пакета ${APP_NAME} v${VERSION} (${ARCH}) ===`);

// 1. Очистка старых сборок
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// 2. Создание структуры каталогов Debian
const DIRS = [
  'DEBIAN',
  'opt/driverhub',
  'opt/driverhub/resources/app',
  'usr/bin',
  'usr/share/applications',
  'usr/share/pixmaps',
  'usr/share/polkit-1/actions',
  'usr/share/icons/hicolor/16x16/apps',
  'usr/share/icons/hicolor/24x24/apps',
  'usr/share/icons/hicolor/32x32/apps',
  'usr/share/icons/hicolor/48x48/apps',
  'usr/share/icons/hicolor/64x64/apps',
  'usr/share/icons/hicolor/128x128/apps',
  'usr/share/icons/hicolor/256x256/apps',
  'usr/share/icons/hicolor/512x512/apps'
];

for (const dir of DIRS) {
  fs.mkdirSync(path.join(BUILD_DIR, dir), { recursive: true });
}

// 3. Копирование рантайма Electron из node_modules/electron/dist
const ELECTRON_DIST = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(ELECTRON_DIST)) {
  throw new Error(`Каталог Electron не найден: ${ELECTRON_DIST}`);
}

console.log('-> Копирование бинарных файлов Electron...');
const electronFiles = fs.readdirSync(ELECTRON_DIST);
for (const file of electronFiles) {
  const src = path.join(ELECTRON_DIST, file);
  const dstName = (file === 'electron') ? APP_NAME : file;
  const dst = path.join(BUILD_DIR, 'opt/driverhub', dstName);

  if (file === 'resources') {
    // Копируем только стандартные файлы ресурсов electron (например default_app.asar если есть)
    fs.mkdirSync(dst, { recursive: true });
    for (const rItem of fs.readdirSync(src)) {
      if (rItem !== 'default_app.asar') {
        const rSrc = path.join(src, rItem);
        const rDst = path.join(dst, rItem);
        if (fs.statSync(rSrc).isDirectory()) {
          fs.cpSync(rSrc, rDst, { recursive: true });
        } else {
          fs.copyFileSync(rSrc, rDst);
        }
      }
    }
  } else {
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dst, { recursive: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

// 4. Копирование файлов приложения в /opt/driverhub/resources/app
console.log('-> Упаковка исходных файлов приложения...');
const appDst = path.join(BUILD_DIR, 'opt/driverhub/resources/app');

// Копируем package.json (очищенный от devDependencies)
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  author: pkg.author,
  license: pkg.license
};
fs.writeFileSync(path.join(appDst, 'package.json'), JSON.stringify(prodPkg, null, 2), 'utf8');

// Копируем каталог src/
fs.cpSync(path.join(PROJECT_ROOT, 'src'), path.join(appDst, 'src'), { recursive: true });

// 5. Создание исполняемого скрипта-лаунчера /usr/bin/driverhub
console.log('-> Создание системного лаунчера /usr/bin/driverhub...');
const launcherScript = `#!/bin/sh
set -e

# DriverHub Linux Launcher
# Автоматическая совместимость с Astra Linux, Debian и Ubuntu
# Пользователю не требуется вручную настраивать chmod/chown!

exec /opt/driverhub/driverhub --no-sandbox "$@"
`;
const launcherPath = path.join(BUILD_DIR, 'usr/bin', APP_NAME);
fs.writeFileSync(launcherPath, launcherScript, { encoding: 'utf8', mode: 0o755 });

// 6. Создание .desktop файла
console.log('-> Создание /usr/share/applications/driverhub.desktop...');
const desktopContent = `[Desktop Entry]
Name=DriverHub
Name[ru]=DriverHub — Менеджер оборудования
Comment=Professional Linux hardware and driver manager
Comment[ru]=Менеджер оборудования, драйверов и модулей ядра для Astra Linux и Debian
GenericName=Driver Manager
GenericName[ru]=Менеджер драйверов
Exec=/usr/bin/driverhub %U
Terminal=false
Type=Application
Icon=driverhub
Categories=System;HardwareSettings;
StartupNotify=true
StartupWMClass=driverhub
Keywords=driver;hardware;printer;canon;cups;firmware;драйвер;принтер;оборудование;
`;
fs.writeFileSync(path.join(BUILD_DIR, 'usr/share/applications', `${APP_NAME}.desktop`), desktopContent, { encoding: 'utf8', mode: 0o644 });

// 7. Копирование иконок в hicolor и pixmaps
console.log('-> Установка иконок приложения...');
const ICONS_MAP = [
  ['16', 'usr/share/icons/hicolor/16x16/apps/driverhub.png'],
  ['24', 'usr/share/icons/hicolor/24x24/apps/driverhub.png'],
  ['32', 'usr/share/icons/hicolor/32x32/apps/driverhub.png'],
  ['48', 'usr/share/icons/hicolor/48x48/apps/driverhub.png'],
  ['64', 'usr/share/icons/hicolor/64x64/apps/driverhub.png'],
  ['128', 'usr/share/icons/hicolor/128x128/apps/driverhub.png'],
  ['256', 'usr/share/icons/hicolor/256x256/apps/driverhub.png'],
  ['512', 'usr/share/icons/hicolor/512x512/apps/driverhub.png']
];

for (const [size, destPath] of ICONS_MAP) {
  const iconSrc = path.join(PROJECT_ROOT, 'src/assets/icons', `driverhub-${size}.png`);
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(BUILD_DIR, destPath));
  }
}
// Pixmap для совместимости со средой Fly DE в Astra Linux
const pixmapSrc = path.join(PROJECT_ROOT, 'src/assets/icons/driverhub-128.png');
if (fs.existsSync(pixmapSrc)) {
  fs.copyFileSync(pixmapSrc, path.join(BUILD_DIR, 'usr/share/pixmaps/driverhub.png'));
}

// 8. Создание Polkit Action Policy
console.log('-> Регистрация политики Polkit...');
const polkitPolicy = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE policyconfig PUBLIC
 "-//freedesktop//DTD PolicyKit Policy Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/PolicyKit/1/policyconfig.dtd">
<policyconfig>
  <vendor>DriverHub Linux (biblioteka33.ru)</vendor>
  <vendor_url>https://biblioteka33.ru</vendor_url>
  <icon_name>driverhub</icon_name>
  <action id="ru.biblioteka33.driverhub.manage">
    <description>DriverHub Hardware Management</description>
    <description xml:lang="ru">Управление оборудованием и драйверами DriverHub</description>
    <message>Authentication is required to install drivers and configure hardware</message>
    <message xml:lang="ru">Для установки драйверов и настройки оборудования требуются права администратора</message>
    <defaults>
      <allow_any>auth_admin</allow_any>
      <allow_inactive>auth_admin</allow_inactive>
      <allow_active>auth_admin_keep</allow_active>
    </defaults>
    <annotate key="org.freedesktop.policykit.exec.path">/usr/bin/driverhub</annotate>
    <annotate key="org.freedesktop.policykit.exec.allow_gui">true</annotate>
  </action>
</policyconfig>
`;
fs.writeFileSync(path.join(BUILD_DIR, 'usr/share/polkit-1/actions/ru.biblioteka33.driverhub.policy'), polkitPolicy, { encoding: 'utf8', mode: 0o644 });

// 9. Создание DEBIAN/control
console.log('-> Генерация DEBIAN/control...');
// Подсчет установленного размера (Installed-Size) в КБ
const installedSizeKb = Math.ceil(Number(execSync(`du -sk "${BUILD_DIR}" | cut -f1`).toString().trim()) || 240000);

const controlContent = `Package: ${APP_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${installedSizeKb}
Maintainer: DriverHub Linux Team <support@biblioteka33.ru>
Depends: libgtk-3-0, libnss3, libasound2 | libasound2t64, libatk-bridge2.0-0, libdrm2, libgbm1, pciutils, usbutils, policykit-1 | pkexec, python3
Recommends: cups, printer-driver-cjet
Homepage: https://biblioteka33.ru
Description: Профессиональный менеджер оборудования и драйверов Linux
 DriverHub обеспечивает сканирование оборудования, загрузку прошивок ядра,
 автоматическую настройку принтеров Canon LBP в Astra Linux и Debian,
 потоковое скачивание deb-пакетов и интеллектуальную диагностику системы.
 Полностью готов к запуску сразу после установки без дополнительной настройки прав.
`;
fs.writeFileSync(path.join(BUILD_DIR, 'DEBIAN/control'), controlContent, { encoding: 'utf8', mode: 0o644 });

// 10. Создание DEBIAN/postinst и DEBIAN/postrm
console.log('-> Создание скриптов postinst / postrm...');
const postinstContent = `#!/bin/sh
set -e

# Установка корректных прав владельца и доступа
chown -R root:root /opt/driverhub
chmod -R u=rwX,go=rX /opt/driverhub

chmod 755 /opt/driverhub/driverhub
chmod 755 /opt/driverhub/chrome_crashpad_handler
chmod 755 /usr/bin/driverhub

# Настройка chrome-sandbox: suid bit 4755
if [ -f /opt/driverhub/chrome-sandbox ]; then
  chown root:root /opt/driverhub/chrome-sandbox
  chmod 4755 /opt/driverhub/chrome-sandbox 2>/dev/null || chmod 755 /opt/driverhub/chrome-sandbox
fi

# Обновление баз данных десктопа и иконок
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

exit 0
`;
fs.writeFileSync(path.join(BUILD_DIR, 'DEBIAN/postinst'), postinstContent, { encoding: 'utf8', mode: 0o755 });

const postrmContent = `#!/bin/sh
set -e

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
  fi
fi

exit 0
`;
fs.writeFileSync(path.join(BUILD_DIR, 'DEBIAN/postrm'), postrmContent, { encoding: 'utf8', mode: 0o755 });

// 11. Выставление правильных прав на всю структуру сборки перед упаковкой
console.log('-> Коррекция файловых атрибутов и прав...');
// Рекурсивно выставляем каталогам 755, файлам 644, исполняемым 755
function fixPermissions(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.chmodSync(fullPath, 0o755);
      fixPermissions(fullPath);
    } else {
      if (
        fullPath.endsWith('/DEBIAN/postinst') ||
        fullPath.endsWith('/DEBIAN/postrm') ||
        fullPath.endsWith('/usr/bin/' + APP_NAME) ||
        fullPath.endsWith('/opt/driverhub/' + APP_NAME) ||
        fullPath.endsWith('/opt/driverhub/chrome_crashpad_handler')
      ) {
        fs.chmodSync(fullPath, 0o755);
      } else if (fullPath.endsWith('/opt/driverhub/chrome-sandbox')) {
        fs.chmodSync(fullPath, 0o4755);
      } else if (fullPath.endsWith('.so') || fullPath.includes('.so.')) {
        fs.chmodSync(fullPath, 0o755);
      } else {
        fs.chmodSync(fullPath, 0o644);
      }
    }
  }
}
fixPermissions(BUILD_DIR);

// 12. Сборка deb-пакета через fakeroot dpkg-deb
console.log(`-> Упаковка dpkg-deb в ${OUTPUT_DEB}...`);
execSync(`fakeroot dpkg-deb -Zxz --build --root-owner-group "${BUILD_DIR}" "${OUTPUT_DEB}"`, {
  stdio: 'inherit'
});

const stats = fs.statSync(OUTPUT_DEB);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`\n✓ deb-пакет успешно создан: ${OUTPUT_DEB} (${sizeMb} MB)`);

// 13. Валидация пакета
console.log('\n--- Информация о пакете (dpkg-deb -I) ---');
execSync(`dpkg-deb -I "${OUTPUT_DEB}"`, { stdio: 'inherit' });
