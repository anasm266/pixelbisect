const enabled = Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined);

function ansi(open: number, close: number, value: string): string {
  return enabled ? `\u001b[${open}m${value}\u001b[${close}m` : value;
}

export const bold = (value: string): string => ansi(1, 22, value);
export const dim = (value: string): string => ansi(2, 22, value);
export const green = (value: string): string => ansi(32, 39, value);
export const red = (value: string): string => ansi(31, 39, value);
export const yellow = (value: string): string => ansi(33, 39, value);
