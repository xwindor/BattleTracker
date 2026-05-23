export const LOG_DECODE_DURATION_MS_PER_CHAR = 28;
export const LOG_DECODE_MIN_MS = 420;
export const LOG_DECODE_MAX_MS = 1200;

export const matrixChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%*+-";

export function randomMatrixChar(): string {
  return matrixChars[Math.floor(Math.random() * matrixChars.length)];
}

export function buildDecodeFrame(finalText: string, revealedChars: number): string {
  let frame = "";
  for (let i = 0; i < finalText.length; i++) {
    const ch = finalText[i];
    if (ch === " " || i < revealedChars) {
      frame += ch;
    } else if (/[A-Za-z0-9]/.test(ch)) {
      frame += randomMatrixChar();
    } else {
      frame += ch;
    }
  }
  return frame;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getLogTextClass(text: string): string {
  if (/Act_Click:|Action_Click:|Interrupt|Free:|Simple:|Complex:|\bAct\b/i.test(text)) {
    return "log-text-action";
  }
  if (/roll/i.test(text)) {
    return "log-text-roll";
  }
  return "log-text-system";
}

export function formatLogText(text: string): string {
  let formatted = escapeHtml(text);
  const rollPattern = /(initiative roll:\s*)(-?\d+)/i;
  if (rollPattern.test(formatted)) {
    return formatted.replace(rollPattern, `$1<span class="log-keyword-roll">$2</span>`);
  }
  const interruptPattern = /^(Interrupt\s+)(.+)$/i;
  if (interruptPattern.test(formatted)) {
    return formatted.replace(interruptPattern, `$1<span class="log-keyword-action">$2</span>`);
  }
  const categoryPattern = /(Free|Simple|Complex):\s*([^|]+)/gi;
  if (categoryPattern.test(formatted)) {
    return formatted.replace(categoryPattern, (_match, label: string, actions: string) => {
      const highlightedActions = actions
        .split(",")
        .map((a: string) => a.trim())
        .filter((a: string) => a.length > 0)
        .map((a: string) => `<span class="log-keyword-action">${a}</span>`)
        .join(", ");
      return `${label}: ${highlightedActions}`;
    });
  }
  formatted = formatted.replace(/(healed\s+Physical\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(healed\s+Stun\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(Physical\s+)(\d+)/gi, `$1<span class="log-keyword-physical">$2</span>`);
  formatted = formatted.replace(/(Stun\s+)(\d+)/gi, `$1<span class="log-keyword-stun">$2</span>`);
  return formatted;
}
