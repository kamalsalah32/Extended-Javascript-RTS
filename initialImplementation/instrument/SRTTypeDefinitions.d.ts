declare module 'SRTutil' {
  export class SRTutil {
    static startLogger(base: string, url: string): void;
    static send(msg: string): void;
    static async endLogger(): void;
  }
}
