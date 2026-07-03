export class TimeStep {
  accumulator = 0;

  constructor(public fixedDtSeconds = 1 / 60) {}

  consume(deltaSeconds: number, step: (dtSeconds: number) => void) {
    this.accumulator += Math.min(deltaSeconds, 0.1);
    while (this.accumulator >= this.fixedDtSeconds) {
      step(this.fixedDtSeconds);
      this.accumulator -= this.fixedDtSeconds;
    }
  }
}
