/**
 * A tiny frame-driven scheduler that lets choreography be written as
 * straightforward async code:
 *
 *   await tl.tween(0.5, t => actor.pos.lerpVectors(a, b, t));
 *   await tl.wait(0.2);
 */

type Task = (dt: number) => boolean; // return true when finished

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export class Timeline {
  private tasks: Task[] = [];
  /** Global animation speed multiplier. */
  speed = 1;
  epoch = 0;

  update(rawDt: number) {
    const dt = rawDt * this.speed;
    // Iterate over a copy: tasks may schedule other tasks.
    const current = this.tasks;
    this.tasks = [];
    const keep: Task[] = [];
    for (const t of current) if (!t(dt)) keep.push(t);
    this.tasks = keep.concat(this.tasks);
    return dt;
  }

  clear() {
    this.tasks = [];
    this.epoch++;
  }

  add(task: Task) {
    this.tasks.push(task);
  }

  tween(duration: number, fn: (t: number) => void, easing: (t: number) => number = ease.inOut): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      if (duration <= 0) {
        fn(1);
        resolve();
        return;
      }
      fn(0);
      this.add((dt) => {
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        fn(easing(t));
        if (t >= 1) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }

  wait(duration: number): Promise<void> {
    return this.tween(duration, () => {}, ease.linear);
  }

  /** Run fn every frame for `duration` seconds (fn gets dt and progress). */
  during(duration: number, fn: (dt: number, t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      this.add((dt) => {
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        fn(dt, t);
        if (t >= 1) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }
}

export const timeline = new Timeline();
