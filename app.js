import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.4.5/dist/web/index.js";

const connectBtn = document.getElementById("btn-connect");
const disconnectBtn = document.getElementById("btn-disconnect");
const monitorBtn = document.getElementById("btn-monitor");
const monitorStopBtn = document.getElementById("btn-monitor-stop");
const flashBtn = document.getElementById("btn-flash");
const remoteBtn = document.getElementById("btn-load-remote");

const firmwareSelect = document.getElementById("firmware-select");
const fileInput = document.getElementById("file-input");
const fileAddress = document.getElementById("file-address");

const deviceStatus = document.getElementById("device-status");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const monitor = document.getElementById("serial-monitor");

let port;
let transport;
let loader;
let monitorReader;
let selectedRemote;
let selectedRemoteAddress = "0x10000";

if (location.protocol === "file:") {
  setStatus("Откройте страницу через http/https (GitHub Pages или локальный сервер)");
}

function setStatus(text) {
  deviceStatus.textContent = text;
}

function setProgress(percent, text) {
  progressBar.style.width = `${percent}%`;
  progressText.textContent = text;
}

function appendMonitor(line) {
  monitor.textContent += line;
  monitor.scrollTop = monitor.scrollHeight;
}

connectBtn.addEventListener("click", async () => {
  try {
    port = await navigator.serial.requestPort({});
    await port.open({ baudRate: 115200 });
    transport = new Transport(port);
    loader = new ESPLoader({
      transport,
      baudrate: 115200,
      terminal: {
        clean() {},
        writeLine(data) {
          appendMonitor(data + "\n");
        },
        write(data) {
          appendMonitor(data);
        },
      },
    });
    setStatus("Устройство подключено");
  } catch (err) {
    setStatus("Ошибка подключения");
  }
});

disconnectBtn.addEventListener("click", async () => {
  try {
    if (monitorReader) {
      await monitorReader.cancel();
      monitorReader = null;
    }
    if (transport) {
      await transport.disconnect();
    }
    if (port) {
      await port.close();
    }
  } finally {
    port = null;
    transport = null;
    loader = null;
    setStatus("Устройство не выбрано");
  }
});

remoteBtn.addEventListener("click", () => {
  const option = firmwareSelect.selectedOptions[0];
  selectedRemote = option?.value || "";
  selectedRemoteAddress = option?.dataset?.address || "0x10000";
  if (selectedRemote) {
    setProgress(0, `Выбрана прошивка: ${option.textContent}`);
  } else {
    setProgress(0, "Прошивка не выбрана");
  }
});

flashBtn.addEventListener("click", async () => {
  if (!loader) {
    setProgress(0, "Сначала выберите устройство");
    return;
  }

  try {
    setProgress(0, "Подготовка...");
    await loader.main();

    const flashOptions = [];

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const address = fileAddress.value || "0x10000";
      const data = await file.arrayBuffer();
      flashOptions.push({ address, data });
    } else if (selectedRemote) {
      const resp = await fetch(selectedRemote);
      const data = await resp.arrayBuffer();
      flashOptions.push({ address: selectedRemoteAddress, data });
    }

    if (flashOptions.length === 0) {
      setProgress(0, "Выберите прошивку или файл");
      return;
    }

    await loader.flash({
      fileArray: flashOptions,
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = total ? Math.round((written / total) * 100) : 0;
        setProgress(percent, `Прошивка: ${percent}%`);
      },
    });

    setProgress(100, "Готово");
  } catch (err) {
    setProgress(0, `Ошибка: ${err?.message || err}`);
  }
});

monitorBtn.addEventListener("click", async () => {
  if (!port || !port.readable) {
    setProgress(0, "Сначала подключите устройство");
    return;
  }

  try {
    monitorReader = port.readable.getReader();
    setProgress(0, "Монитор запущен");
    while (true) {
      const { value, done } = await monitorReader.read();
      if (done) break;
      if (value) {
        const text = new TextDecoder().decode(value);
        appendMonitor(text);
      }
    }
  } catch (err) {
    setProgress(0, "Монитор остановлен");
  }
});

monitorStopBtn.addEventListener("click", async () => {
  if (monitorReader) {
    await monitorReader.cancel();
    monitorReader = null;
    setProgress(0, "Монитор остановлен");
  }
});
