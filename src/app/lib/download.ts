/** Save bytes as a file through the browser's download path (Downloads folder on Android/Windows). */
export function downloadBytes(name: string, mime: string, data: Uint8Array | ArrayBuffer): void {
  const blob = new Blob([data instanceof Uint8Array ? new Uint8Array(data) : data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
