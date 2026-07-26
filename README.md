# AIOC Toolkit

A single browser-based toolkit for the [AIOC](https://github.com/skuep/AIOC) USB adapter for
handheld radios — device configuration over WebHID, and firmware flashing over WebUSB/DFU,
in one page with no install and no build step.

Live at: **https://g1lro.github.io/aioc-toolkit/**

Runs entirely client-side in a Chromium-based browser (Chrome/Edge). Requires HTTPS or
`localhost` for WebHID/WebUSB access.

## Configure tab

Read and write AIOC registers: PTT sources, CM108 button sources, audio gain/boost,
AutoPTT/VCOS thresholds, foxhunt beacon, USB VID/PID override, and a live GPIO status
panel. Connects to the device over WebHID.

## Flash Firmware tab

Flashes a `.bin` firmware image to the AIOC over WebUSB using the USB DFU class
(ST DfuSe extensions). **The AIOC must already be in DFU/bootloader mode before it will
appear here** — this tool doesn't switch it into that mode for you. See the
[AIOC hardware docs](https://github.com/skuep/AIOC#how-to-program) for how to enter DFU
mode for your firmware version.

The device's boot ROM is separate from application flash, so a failed or interrupted
flash is recoverable via the same manual DFU-entry procedure — but always double-check
you're flashing an official AIOC firmware image before starting.

## Attribution

This project combines two existing open-source works rather than starting from scratch:

- **Configuration UI** is based on [hrafnkelle/aioc-util](https://github.com/hrafnkelle/aioc-util)
  (MIT License) by TF3HR, including the light/dark theme, real-time GPIO status panel, and
  multi-VID/PID connect support contributed by [G1LRO](https://g1lro.uk/?p=676).
- **DFU/DfuSe flashing** (`webui/vendor/dfu.js`, `webui/vendor/dfuse.js`) is vendored
  unmodified from [devanlai/webdfu](https://github.com/devanlai/webdfu) (ISC License), a
  browser port of `dfu-util`'s protocol handling.

See the license headers in `webui/vendor/` for the original ISC copyright notice.

## License

MIT — see [LICENSE](LICENSE). The vendored files under `webui/vendor/` remain under their
original ISC license (permissive and compatible, see headers in those files).
