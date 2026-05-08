let _instance  = null;
let _scanning  = false;

export function createScanner(elementId, onScan) {
  _instance = new Html5Qrcode(elementId);

  return {
    start: async () => {
      if (_scanning) return;
      await _instance.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 260, height: 100 },
          aspectRatio: 1.7778,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
        },
        (decoded) => {
          const isbn = decoded.replace(/[^0-9X]/gi, "");
          if (isbn.length === 10 || isbn.length === 13) onScan(isbn);
        },
        () => {} // ignore per-frame errors
      );
      _scanning = true;
    },

    stop: async () => {
      if (!_scanning) return;
      try { await _instance.stop(); } catch { /* already stopped */ }
      _scanning = false;
    },

    isRunning: () => _scanning,
  };
}
