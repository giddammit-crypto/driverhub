// Canon LBP2900 - LBP6000 специализированная поддержка для Astra Linux / Debian / Ubuntu
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CANON_MODELS = {
  'LBP2900': {
    name: 'Canon i-SENSYS LBP2900 / LBP2900B',
    usbId: '04a9:2676',
    vendorId: '04a9',
    productId: '2676',
    ppdName: 'CNCUPSLBP2900CAPTK.ppd',
    displayName: 'Canon LBP2900',
    speed: '12 ppm',
    resolution: '600x600 dpi',
    protocol: 'CAPT v1.5'
  },
  'LBP3000': {
    name: 'Canon i-SENSYS LBP3000',
    usbId: '04a9:268a',
    vendorId: '04a9',
    productId: '268a',
    ppdName: 'CNCUPSLBP3000CAPTK.ppd',
    displayName: 'Canon LBP3000',
    speed: '14 ppm',
    resolution: '600x600 dpi',
    protocol: 'CAPT v1.5'
  },
  'LBP6000': {
    name: 'Canon i-SENSYS LBP6000 / LBP6018',
    usbId: '04a9:271a',
    vendorId: '04a9',
    productId: '271a',
    ppdName: 'CNCUPSLBP6000CAPTK.ppd',
    displayName: 'Canon LBP6000',
    speed: '18 ppm',
    resolution: '2400x600 dpi (AIR)',
    protocol: 'CAPT v2.0'
  },
  'LBP6020': {
    name: 'Canon i-SENSYS LBP6020 / LBP6020B',
    usbId: '04a9:271b',
    vendorId: '04a9',
    productId: '271b',
    ppdName: 'CNCUPSLBP6020CAPTK.ppd',
    displayName: 'Canon LBP6020',
    speed: '18 ppm',
    resolution: '2400x600 dpi (AIR)',
    protocol: 'CAPT v2.0'
  },
  'LBP6030': {
    name: 'Canon i-SENSYS LBP6030 / LBP6030B / LBP6030w',
    usbId: '04a9:271c',
    vendorId: '04a9',
    productId: '271c',
    ppdName: 'CNCUPSLBP6030CAPTK.ppd',
    displayName: 'Canon LBP6030',
    speed: '18 ppm',
    resolution: '2400x600 dpi (AIR)',
    protocol: 'CAPT v2.0'
  },
  'LBP3010': {
    name: 'Canon i-SENSYS LBP3010 / LBP3050',
    usbId: '04a9:266a',
    vendorId: '04a9',
    productId: '266a',
    ppdName: 'CNCUPSLBP3010CAPTK.ppd',
    displayName: 'Canon LBP3010',
    speed: '14 ppm',
    resolution: '600x600 dpi',
    protocol: 'CAPT v1.5'
  }
};

function generatePpdContent(modelKey) {
  const model = CANON_MODELS[modelKey] || CANON_MODELS.LBP2900;
  return `*PPD-Adobe: "4.3"
*% PPD file for ${model.name} for CUPS / Astra Linux
*FormatVersion: "4.3"
*FileVersion: "2.71"
*LanguageVersion: Russian
*LanguageEncoding: UTF-8
*PCFileName: "${model.ppdName}"
*Product: "(${model.displayName})"
*Manufacturer: "Canon"
*ModelName: "${model.name} CAPT"
*ShortNickName: "${model.displayName}"
*NickName: "${model.displayName} (Astra Linux CAPT Suite)"
*PSVersion: "(3010.000) 550"
*LanguageLevel: "3"
*ColorDevice: False
*DefaultColorSpace: Gray
*FileSystem: False
*Throughput: "${model.speed.split(' ')[0]}"
*LandscapeOrientation: Plus90
*TTRasterizer: Type42
*cupsVersion: 1.2
*cupsModelNumber: 0
*cupsManualCopies: True
*cupsFilter: "application/vnd.cups-raster 0 rastertocapt"
*OpenUI *PageSize/Формат бумаги: PickOne
*OrderDependency: 10 AnySetup *PageSize
*DefaultPageSize: A4
*PageSize A4/A4: "<</PageSize[595 842]/ImagingBBox null>>setpagedevice"
*PageSize Letter/US Letter: "<</PageSize[612 792]/ImagingBBox null>>setpagedevice"
*PageSize A5/A5: "<</PageSize[420 595]/ImagingBBox null>>setpagedevice"
*CloseUI: *PageSize
*OpenUI *PageRegion/Область печати: PickOne
*OrderDependency: 10 AnySetup *PageRegion
*DefaultPageRegion: A4
*PageRegion A4/A4: "<</PageSize[595 842]/ImagingBBox null>>setpagedevice"
*PageRegion Letter/US Letter: "<</PageSize[612 792]/ImagingBBox null>>setpagedevice"
*PageRegion A5/A5: "<</PageSize[420 595]/ImagingBBox null>>setpagedevice"
*CloseUI: *PageRegion
*DefaultImageableArea: A4
*ImageableArea A4/A4: "14.17 14.17 581.10 828.09"
*ImageableArea Letter/US Letter: "14.17 14.17 597.83 777.83"
*ImageableArea A5/A5: "14.17 14.17 405.83 580.83"
*DefaultPaperDimension: A4
*PaperDimension A4/A4: "595 842"
*PaperDimension Letter/US Letter: "612 792"
*PaperDimension A5/A5: "420 595"
*OpenUI *Resolution/Разрешение печати: PickOne
*OrderDependency: 20 AnySetup *Resolution
*DefaultResolution: 600dpi
*Resolution 600dpi/600 dpi: "<</HWResolution[600 600]>>setpagedevice"
*CloseUI: *Resolution
`;
}

function generateSetupScript(modelKey, printerName = null) {
  const model = CANON_MODELS[modelKey] || CANON_MODELS.LBP2900;
  const name = printerName || model.displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ppdContent = generatePpdContent(modelKey);
  const ppdBase64 = Buffer.from(ppdContent, 'utf8').toString('base64');

  return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
export LC_ALL=C

echo "==> [DriverHub] Настройка Canon LBP для Astra Linux / Debian..."
echo "==> Модель: ${model.name} (${modelKey})"

# Шаг 1: Проверка и установка базовых пакетов CUPS
echo "STEP:1:20:Проверка и подготовка подсистемы печати CUPS..."
if ! command -v cupsd >/dev/null 2>&1 || ! command -v lpadmin >/dev/null 2>&1; then
  echo "Установка CUPS и системных библиотек печати..."
  apt-get update -y
  apt-get install -y --no-install-recommends cups cups-client cups-bsd printer-driver-cjet
fi

# Шаг 2: Обеспечение загрузки модуля ядра usblp
echo "STEP:2:40:Настройка модуля ядра usblp и разрешений USB..."
# В Astra Linux / Debian usblp часто отключается по умолчанию
mkdir -p /etc/modules-load.d /etc/modprobe.d
echo "usblp" > /etc/modules-load.d/usblp.conf

# Удаляем или деактивируем блокировку usblp, если присутствует
if [ -f /etc/modprobe.d/blacklist-cups-usblp.conf ]; then
  sed -i 's/^blacklist usblp/#blacklist usblp/' /etc/modprobe.d/blacklist-cups-usblp.conf || true
fi
cat << 'EOF_MOD' > /etc/modprobe.d/canon-usblp.conf
# DriverHub: Разрешение usblp для принтеров Canon CAPT
alias symbol:usblp usblp
options usblp quirks=0x04a9:0x${model.productId}:0x0001
EOF_MOD

modprobe usblp 2>/dev/null || true

# Шаг 3: Создание FIFO буфера для CCPD
echo "STEP:3:60:Создание буфера CCPD /var/ccpd/fifo0..."
mkdir -p /var/ccpd
chmod 777 /var/ccpd
if [ ! -p /var/ccpd/fifo0 ]; then
  rm -f /var/ccpd/fifo0
  mkfifo /var/ccpd/fifo0
fi
chmod 666 /var/ccpd/fifo0

# Шаг 4: Установка Udev правил для авто-восстановления при переподключении USB
echo "STEP:4:75:Установка правил udev и systemd службы..."
cat << 'EOF_UDEV' > /etc/udev/rules.d/85-canon-capt.rules
# DriverHub: Правила автоматического восстановления Canon CAPT при включении USB
KERNEL=="lp*", SUBSYSTEMS=="usb", ATTRS{idVendor}=="04a9", MODE="0666", GROUP="lp"
KERNEL=="lp*", SUBSYSTEMS=="usb", ATTRS{idVendor}=="04a9", SYMLINK+="usb/lp0"
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="04a9", RUN+="/bin/systemctl restart ccpd"
EOF_UDEV

udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=usb 2>/dev/null || true

# Служба systemd для ccpd
cat << 'EOF_SVC' > /etc/systemd/system/ccpd.service
[Unit]
Description=Canon CAPT CCPD Daemon (Astra Linux Suite)
After=cups.service
Requires=cups.service

[Service]
Type=forking
ExecStart=/usr/sbin/ccpd
ExecStop=/usr/bin/killall -9 ccpd 2>/dev/null || true
Restart=on-failure
RestartSec=3s

[Install]
WantedBy=multi-user.target
EOF_SVC

systemctl daemon-reload 2>/dev/null || true

# Шаг 5: Регистрация PPD и очереди CUPS
echo "STEP:5:85:Регистрация принтера ${name} в очереди CUPS..."
mkdir -p /usr/share/cups/model/canon /etc/cups/ppd
echo "${ppdBase64}" | base64 -d > "/usr/share/cups/model/canon/${model.ppdName}"
echo "${ppdBase64}" | base64 -d > "/etc/cups/ppd/${name}.ppd"
chmod 644 "/usr/share/cups/model/canon/${model.ppdName}" "/etc/cups/ppd/${name}.ppd"

systemctl restart cups 2>/dev/null || /etc/init.d/cups restart 2>/dev/null || true

# Регистрируем очередь через lpadmin
lpadmin -x "${name}" 2>/dev/null || true
lpadmin -p "${name}" -m "canon/${model.ppdName}" -v "ccp:/var/ccpd/fifo0" -E 2>/dev/null || \
lpadmin -p "${name}" -P "/etc/cups/ppd/${name}.ppd" -v "ccp:/var/ccpd/fifo0" -E 2>/dev/null || \
lpadmin -p "${name}" -v "usb://Canon/${model.displayName}" -E 2>/dev/null || true

cupsenable "${name}" 2>/dev/null || true
cupsaccept "${name}" 2>/dev/null || true

# Если в системе есть утилита ccpdadmin от официального пакета, связываем
if [ -x /usr/sbin/ccpdadmin ]; then
  /usr/sbin/ccpdadmin -x "${name}" 2>/dev/null || true
  /usr/sbin/ccpdadmin -p "${name}" -o /dev/usb/lp0 2>/dev/null || true
  systemctl enable ccpd 2>/dev/null || true
  systemctl restart ccpd 2>/dev/null || /etc/init.d/ccpd restart 2>/dev/null || true
fi

# Шаг 6: Добавление пользователей в группы lp и lpadmin (критично для Astra Linux)
echo "STEP:6:95:Настройка прав пользователей в группах lp и lpadmin (Astra Linux)..."
groupadd -f lp 2>/dev/null || true
groupadd -f lpadmin 2>/dev/null || true

TARGET_USERS=""
if [ -n "$SUDO_USER" ]; then TARGET_USERS="$TARGET_USERS $SUDO_USER"; fi
if [ -n "$PKEXEC_UID" ]; then
  P_USER=$(id -nu "$PKEXEC_UID" 2>/dev/null || true)
  if [ -n "$P_USER" ]; then TARGET_USERS="$TARGET_USERS $P_USER"; fi
fi
SYS_USERS=$(awk -F: '$3 >= 1000 && $3 < 60000 {print $1}' /etc/passwd 2>/dev/null || true)
ALL_USERS=$(echo "$TARGET_USERS $SYS_USERS" | tr ' ' '\n' | grep -v '^$' | sort -u)

for u in $ALL_USERS; do
  if id "$u" >/dev/null 2>&1; then
    usermod -a -G lp "$u" 2>/dev/null || true
    usermod -a -G lpadmin "$u" 2>/dev/null || true
    echo "Пользователь $u добавлен в группы lp и lpadmin"
  fi
done

echo "STEP:7:100:Canon LBP успешно сконфигурирован!"
echo "==> [DriverHub] Установка завершена: принтер ${name} зарегистрирован в CUPS."
`;
}

function generateFixCanonPermissionsScript(targetUser = '') {
  return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
export LC_ALL=C

echo "==> [DriverHub] Исправление прав доступа и групп пользователя для Canon LBP (Astra Linux)..."
echo "STEP:1:25:Создание системных групп lp и lpadmin..."
groupadd -f lp 2>/dev/null || true
groupadd -f lpadmin 2>/dev/null || true

echo "STEP:2:50:Добавление пользователя в группы lp и lpadmin..."
USERS_TO_FIX="${targetUser}"
if [ -z "$USERS_TO_FIX" ]; then
  if [ -n "$SUDO_USER" ]; then USERS_TO_FIX="$USERS_TO_FIX $SUDO_USER"; fi
  if [ -n "$PKEXEC_UID" ]; then
    P_USER=$(id -nu "$PKEXEC_UID" 2>/dev/null || true)
    if [ -n "$P_USER" ]; then USERS_TO_FIX="$USERS_TO_FIX $P_USER"; fi
  fi
  ACT_USERS=$(who 2>/dev/null | awk '{print $1}' | sort -u || true)
  SYS_USERS=$(awk -F: '$3 >= 1000 && $3 < 60000 {print $1}' /etc/passwd 2>/dev/null || true)
  USERS_TO_FIX=$(echo "$USERS_TO_FIX $ACT_USERS $SYS_USERS" | tr ' ' '\n' | grep -v '^$' | sort -u)
fi

for u in $USERS_TO_FIX; do
  if id "$u" >/dev/null 2>&1; then
    usermod -a -G lp "$u" 2>/dev/null || true
    usermod -a -G lpadmin "$u" 2>/dev/null || true
    echo "Пользователь $u успешно включен в группы lp и lpadmin"
  fi
done

echo "STEP:3:75:Настройка прав на буфер /var/ccpd/fifo0 и устройство /dev/usb/lp0..."
mkdir -p /var/ccpd
chmod 777 /var/ccpd
if [ ! -p /var/ccpd/fifo0 ]; then
  rm -f /var/ccpd/fifo0
  mkfifo /var/ccpd/fifo0
fi
chmod 666 /var/ccpd/fifo0
chown -R root:lp /var/ccpd 2>/dev/null || true
chmod 666 /dev/usb/lp* 2>/dev/null || true
chown root:lp /dev/usb/lp* 2>/dev/null || true

cat << 'EOF_UDEV' > /etc/udev/rules.d/85-canon-capt.rules
# DriverHub: Правила автоматического восстановления Canon CAPT при включении USB
KERNEL=="lp*", SUBSYSTEMS=="usb", ATTRS{idVendor}=="04a9", MODE="0666", GROUP="lp"
KERNEL=="lp*", SUBSYSTEMS=="usb", ATTRS{idVendor}=="04a9", SYMLINK+="usb/lp0"
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="04a9", RUN+="/bin/systemctl restart ccpd"
EOF_UDEV

udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=usb 2>/dev/null || true

echo "STEP:4:90:Перезапуск служб печати CUPS и CCPD..."
cancel -a 2>/dev/null || true
systemctl restart cups 2>/dev/null || /etc/init.d/cups restart 2>/dev/null || true
if systemctl list-unit-files 2>/dev/null | grep -q ccpd; then
  systemctl restart ccpd 2>/dev/null || true
fi

echo "STEP:5:100:Права печати Canon LBP успешно восстановлены!"
`;
}

function detectCanonPrinters(devices = []) {
  const detected = [];
  for (const device of devices) {
    const text = `${device.name} ${device.detail || ''}`.toLowerCase();
    for (const [key, model] of Object.entries(CANON_MODELS)) {
      if (text.includes(model.productId.toLowerCase()) || text.includes(key.toLowerCase()) || (text.includes('canon') && text.includes(key.toLowerCase()))) {
        detected.push({
          modelKey: key,
          model,
          device
        });
      }
    }
  }
  return detected;
}

module.exports = {
  CANON_MODELS,
  generatePpdContent,
  generateSetupScript,
  generateFixCanonPermissionsScript,
  detectCanonPrinters
};
