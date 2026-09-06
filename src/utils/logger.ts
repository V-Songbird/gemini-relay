// WIP
import { LOG_PREFIX } from "../constants.js";

export class Logger {
  private static formatMessage(message: string): string {
    return `${LOG_PREFIX} ${message}` + "\n";
  }

  // Routine logging is muted when NODE_ENV=test so the test reporter output
  // stays readable; errors are never muted. Production never sets NODE_ENV=test,
  // so default (1.1.6-parity) behaviour is unchanged.
  private static get muted(): boolean {
    return process.env.NODE_ENV === "test";
  }

  static log(message: string, ...args: any[]): void {
    if (this.muted) return;
    console.warn(this.formatMessage(message), ...args);
  }

  static warn(message: string, ...args: any[]): void {
    if (this.muted) return;
    console.warn(this.formatMessage(message), ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(this.formatMessage(message), ...args);
  }

  static debug(message: string, ...args: any[]): void {
    if (this.muted) return;
    console.warn(this.formatMessage(message), ...args);
  }

  // The shape of a tool call, never its values. `prompt` alone can be a whole
  // pasted file before @-expansion even touches it, and this line reached the
  // MCP client's log on every call — the same leak as commandExecution below.
  static toolInvocation(toolName: string, args: any): void {
    const shape =
      args && typeof args === "object"
        ? Object.entries(args)
            .map(([k, v]) => `${k}=${typeof v === "string" ? `<${v.length} chars>` : JSON.stringify(v)}`)
            .join(" ")
        : "";
    this.warn(`Tool ${toolName}(${shape})`);
  }

  // A flag as agy spells them: `-p`, `--model`, `--output-format=json`. Never
  // matches a prompt, which carries whitespace and is usually far longer.
  private static readonly FLAG = /^--?[\w-]+(=[\w.,:/@-]*)?$/;

  // Log the shape of the argv, never its bodies. Prompts now carry whole inlined
  // files, so echoing each argument dumped megabytes of prompt text to the MCP
  // server's stderr — and from there into client logs — on every spawn.
  static commandExecution(command: string, args: string[], startTime: number): void {
    const shape = args
      .map((arg) => (this.FLAG.test(arg) ? arg : `<${arg.length} chars>`))
      .join(" ");
    this.warn(`[${startTime}] Starting: ${command} ${shape}`);
  }

  // No argv is retained between the two calls below: a map keyed on startTime
  // used to hold { command, args }, but nothing ever read it and the timeout and
  // spawn-error paths in executeCommand reject without calling commandComplete,
  // so every failed run pinned its whole inlined prompt for the server's life.
  static commandComplete(startTime: number, exitCode: number | null, outputLength?: number): void {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.warn(`[${elapsed}s] Process finished with exit code: ${exitCode}`);
    if (outputLength !== undefined) {
      this.warn(`Response: ${outputLength} chars`);
    }
  }
}