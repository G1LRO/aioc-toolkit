'use strict';

// ── Flash Firmware tab: WebUSB + DFU/DfuSe, using vendor/dfu.js + vendor/dfuse.js ──
//
// The AIOC must already be in DFU/bootloader mode before it appears here — this
// tab never sends a DFU_DETACH itself. The user switches modes physically (see
// the AIOC hardware docs) and reconnects, so HID and DFU sessions never overlap.

const DFU_VID_FILTER = 0x1209; // same VID the AIOC uses in normal + DFU mode

let dfuDevice = null;      // dfu.Device or dfuse.Device wrapping the open USBDevice
let dfuTransferSize = 2048;
let dfuManifestationTolerant = false;
let dfuSelectedFile = null;

function niceSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MiB';
  if (bytes >= 1024)    return (bytes / 1024).toFixed(1) + ' KiB';
  return bytes + ' B';
}

// Some browsers/devices don't resolve USBAlternateInterface.interfaceName
// automatically; read the string descriptors by hand when that happens.
// Ported from devanlai/webdfu's dfu-util.js (see vendor/dfu.js header).
async function fixInterfaceNames(rawDevice, interfaces) {
  if (!interfaces.some(intf => intf.name == null)) return;
  const tempDevice = new dfu.Device(rawDevice, interfaces[0]);
  await tempDevice.device_.open();
  await tempDevice.device_.selectConfiguration(1);
  const mapping = await tempDevice.readInterfaceNames();
  await tempDevice.close();
  for (const intf of interfaces) {
    if (intf.name === null) {
      const cfg = intf.configuration.configurationValue;
      const num = intf['interface'].interfaceNumber;
      const alt = intf.alternate.alternateSetting;
      intf.name = mapping[cfg][num][alt];
    }
  }
}

// Reads the DFU functional descriptor for transfer size / manifestation-tolerance.
// Ported/simplified from devanlai/webdfu's dfu-util.js getDFUDescriptorProperties().
async function getDfuFunctionalDescriptor(device) {
  try {
    const data = await device.readConfigurationDescriptor(0);
    const configDesc = dfu.parseConfigurationDescriptor(data);
    if (configDesc.bConfigurationValue !== device.settings.configuration.configurationValue) return {};
    const funcDesc = configDesc.descriptors.find(d => d.bDescriptorType == 0x21 && 'bcdDFUVersion' in d);
    if (!funcDesc) return {};
    return {
      manifestationTolerant: (funcDesc.bmAttributes & 0x04) !== 0,
      transferSize: funcDesc.wTransferSize,
      dfuVersion: funcDesc.bcdDFUVersion,
    };
  } catch (e) {
    return {};
  }
}

function setDfuConnected(connected) {
  const dot = document.getElementById('dfu-dot');
  const label = document.getElementById('dfu-conn-label');
  const btn = document.getElementById('btn-dfu-connect');
  const prompt = document.getElementById('dfu-connect-prompt');
  dot.className = 'dot' + (connected ? ' ok' : '');
  label.textContent = connected ? 'Connected' : 'Not connected';
  btn.textContent = connected ? 'Disconnect' : 'Connect (WebUSB)';
  btn.className = connected ? 'btn btn-ghost' : 'btn btn-primary';
  prompt.style.display = connected ? 'none' : '';
  document.querySelectorAll('.needs-dfu-device').forEach(el => el.classList.toggle('active', connected));
  if (!connected) {
    document.getElementById('dfu-mode-badge').textContent = '—';
    document.getElementById('dfu-mode-badge').className = 'badge';
    document.getElementById('dfu-i-prod').textContent = '—';
    document.getElementById('dfu-i-serial').textContent = '—';
    document.getElementById('dfu-i-xfer').textContent = '—';
    document.getElementById('dfu-i-mem').textContent = '—';
    document.getElementById('dfu-seg-table').style.display = 'none';
    document.getElementById('dfu-runtime-warning').style.display = 'none';
    document.getElementById('dfu-file').disabled = true;
    document.getElementById('dfu-file').value = '';
    document.getElementById('dfu-file-info').textContent = '';
    document.getElementById('btn-dfu-flash').disabled = true;
    document.getElementById('dfu-progress').style.width = '0%';
    dfuSelectedFile = null;
  }
}

function renderMemoryInfo(memoryInfo) {
  const tbody = document.getElementById('dfu-seg-tbody');
  const table = document.getElementById('dfu-seg-table');
  const memField = document.getElementById('dfu-i-mem');
  if (!memoryInfo || !memoryInfo.segments.length) {
    table.style.display = 'none';
    memField.textContent = '—';
    return;
  }
  const totalSize = memoryInfo.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  memField.textContent = `${memoryInfo.name} (${niceSize(totalSize)})`;
  tbody.innerHTML = '';
  for (const seg of memoryInfo.segments) {
    const props = ['readable', 'erasable', 'writable'].filter((_, i) =>
      [seg.readable, seg.erasable, seg.writable][i]);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>0x${seg.start.toString(16)}–0x${(seg.end - 1).toString(16)}</td>` +
      `<td>${niceSize(seg.end - seg.start)}</td><td>${props.join(', ') || 'inaccessible'}</td>`;
    tbody.appendChild(tr);
  }
  table.style.display = '';
}

async function connectDfu() {
  if (!navigator.usb) {
    logErr('WebUSB is not available. Use Chrome/Edge over HTTPS or localhost.');
    return;
  }
  try {
    const rawDevice = await navigator.usb.requestDevice({ filters: [{ vendorId: DFU_VID_FILTER }] });
    const interfaces = dfu.findDeviceDfuInterfaces(rawDevice);
    if (!interfaces.length) {
      logErr('No DFU interface found on this device. Make sure the AIOC is in DFU/bootloader mode.');
      return;
    }
    await fixInterfaceNames(rawDevice, interfaces);

    let candidate = new dfu.Device(rawDevice, interfaces[0]);
    candidate.logDebug = () => {};
    candidate.logInfo = logOk;
    candidate.logWarning = logWarn;
    candidate.logError = logErr;
    candidate.logProgress = (done, total) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      document.getElementById('dfu-progress').style.width = pct + '%';
    };

    await candidate.open();

    const desc = await getDfuFunctionalDescriptor(candidate);
    dfuTransferSize = desc.transferSize || 2048;
    dfuManifestationTolerant = !!desc.manifestationTolerant;

    const isDfuMode = candidate.settings.alternate.interfaceProtocol === 0x02;
    if (isDfuMode && desc.dfuVersion === 0x011a) {
      // DfuSe (ST extensions) — upgrade to the memory-aware device wrapper.
      dfuDevice = new dfuse.Device(candidate.device_, candidate.settings);
      dfuDevice.logDebug = candidate.logDebug;
      dfuDevice.logInfo = candidate.logInfo;
      dfuDevice.logWarning = candidate.logWarning;
      dfuDevice.logError = candidate.logError;
      dfuDevice.logProgress = candidate.logProgress;
      if (dfuDevice.getFirstWritableSegment) {
        const seg = dfuDevice.getFirstWritableSegment();
        if (seg) dfuDevice.startAddress = seg.start;
      }
    } else {
      dfuDevice = candidate;
    }

    logOk(`Connected: ${rawDevice.productName || 'AIOC (DFU)'}`);
    setDfuConnected(true);

    document.getElementById('dfu-i-prod').textContent = rawDevice.productName || '—';
    document.getElementById('dfu-i-serial').textContent = rawDevice.serialNumber || '—';
    document.getElementById('dfu-i-xfer').textContent = niceSize(dfuTransferSize);

    const badge = document.getElementById('dfu-mode-badge');
    if (isDfuMode && dfuDevice.memoryInfo) {
      badge.textContent = 'DFU mode';
      badge.className = 'badge badge-ok';
      document.getElementById('dfu-runtime-warning').style.display = 'none';
      document.getElementById('dfu-file').disabled = false;
      renderMemoryInfo(dfuDevice.memoryInfo);
    } else if (isDfuMode) {
      badge.textContent = 'DFU mode (unsupported)';
      badge.className = 'badge badge-warn';
      logErr('Device is in DFU mode but did not report a DfuSe memory map — this simplified flasher only supports ST DfuSe-style devices like the AIOC.');
    } else {
      badge.textContent = 'Runtime (not flashable)';
      badge.className = 'badge badge-warn';
      document.getElementById('dfu-runtime-warning').style.display = '';
      logWarn('Device is in DFU runtime mode, not bootloader mode — flashing is disabled until you switch it manually.');
    }
  } catch (e) {
    if (e && e.name === 'NotFoundError') {
      log('No device selected.');
    } else {
      logErr('Connect failed: ' + (e.message || e));
    }
  }
}

async function disconnectDfu() {
  if (dfuDevice) {
    try { await dfuDevice.close(); } catch (_) {}
    dfuDevice = null;
    log('Disconnected.');
  }
  setDfuConnected(false);
}

document.getElementById('btn-dfu-connect').addEventListener('click', () => {
  if (dfuDevice) disconnectDfu(); else connectDfu();
});

document.getElementById('dfu-file').addEventListener('change', (event) => {
  const file = event.target.files[0] || null;
  dfuSelectedFile = file;
  const info = document.getElementById('dfu-file-info');
  const flashBtn = document.getElementById('btn-dfu-flash');
  if (file) {
    info.textContent = `${file.name} (${niceSize(file.size)})`;
    flashBtn.disabled = false;
  } else {
    info.textContent = '';
    flashBtn.disabled = true;
  }
});

document.getElementById('btn-dfu-flash').addEventListener('click', async () => {
  if (!dfuDevice || !dfuSelectedFile) return;
  if (!confirm(`Flash "${dfuSelectedFile.name}" (${niceSize(dfuSelectedFile.size)}) to the AIOC?\n\nDo not disconnect or power off the device during this process.`)) {
    return;
  }
  const flashBtn = document.getElementById('btn-dfu-flash');
  const fileInput = document.getElementById('dfu-file');
  flashBtn.disabled = true;
  fileInput.disabled = true;
  document.getElementById('dfu-progress').style.width = '0%';
  try {
    const data = await dfuSelectedFile.arrayBuffer();
    try {
      const status = await dfuDevice.getStatus();
      if (status.state === dfu.dfuERROR) await dfuDevice.clearStatus();
    } catch (_) {
      logWarn('Could not clear a stale DFU error state before flashing.');
    }
    await dfuDevice.do_download(dfuTransferSize, data, dfuManifestationTolerant);
    logOk('Flash complete. The AIOC is rebooting into the new firmware.');
  } catch (e) {
    logErr('Flash failed: ' + (e.message || e));
    flashBtn.disabled = false;
    fileInput.disabled = false;
  }
});

// The device resets itself after a successful flash (or may be unplugged
// mid-session) — either way, reflect that in the UI.
if (navigator.usb) {
  navigator.usb.addEventListener('disconnect', (event) => {
    if (dfuDevice && event.device === dfuDevice.device_) {
      dfuDevice = null;
      log('DFU device disconnected.', 'warn');
      setDfuConnected(false);
    }
  });
}

window.addEventListener('beforeunload', () => {
  if (dfuDevice) dfuDevice.close().catch(() => {});
});

// ── Initial state ──────────────────────────────────────────────────────────
setDfuConnected(false);
log('Flash Firmware tab ready. Switch the AIOC into DFU mode, then click Connect.');
if (!navigator.usb) {
  logErr('WebUSB is not supported in this browser. Use a compatible browser on a desktop computer.');
}
