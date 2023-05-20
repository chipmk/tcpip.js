declare module '@chipmk/v86' {
  export class V86Starter {
    constructor(options: any);
    add_listener(event: string, listener: (value: any) => void): void;
    add_listener(
      event: 'screen-put-char',
      listener: ([row, col, char]: [number, number, number]) => void
    ): void;
    add_listener(
      event: 'serial0-output-char',
      listener: (char: string) => void
    ): void;
    save_state(): Promise<ArrayBuffer>;
    serial0_send(key: string): void;
    stop(): void;
  }
}
