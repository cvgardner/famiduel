import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { PingPong, PingPongBot } from '../src/games/pingpong/logic';
import { BounceMark, MARK_FADE, RING_TIME } from '../src/games/pingpong/bouncemark';
import { MID } from '../src/engine/world';
import { DT, player } from './helpers';

describe('ping pong bounce mark', () => {
  it('holds the spot until released, then fades out', () => {
    const m = new BounceMark();
    expect(m.spot).toBeNull();
    m.land(100, 200, '#fff');
    m.tick(0.1);
    expect(m.ring()).toBeCloseTo(0.1 / RING_TIME);
    m.tick(5); // a slow ball: the ring is long gone, the spot is not
    expect(m.ring()).toBeNull();
    expect(m.alpha()).toBe(1);
    m.release();
    m.tick(MARK_FADE / 2);
    expect(m.alpha()).toBeGreaterThan(0);
    expect(m.alpha()).toBeLessThan(1);
    m.tick(MARK_FADE);
    expect(m.spot).toBeNull();
  });

  it('a new bounce replaces the old spot; clear drops it at once', () => {
    const m = new BounceMark();
    m.land(1, 2, '#fff');
    m.release();
    m.land(3, 4, '#ffd54a');
    expect(m.spot).toMatchObject({ x: 3, y: 4, fade: null });
    m.clear();
    expect(m.spot).toBeNull();
  });

  it('in real rallies every landing spot shows on the receiver\'s half until they hit it back', () => {
    let landings = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = makeRng(seed);
      const g = new PingPong([player({ bot: 'normal' }), player({ bot: 'normal' })], false, rng);
      const bots = [new PingPongBot(0, 'normal', rng), new PingPongBot(1, 'normal', rng)];
      const m = new BounceMark();
      let t = 0;
      while (g.winner === null && t < 120) {
        g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
        m.tick(DT);
        for (const e of g.events) {
          if (e.type === 'hit') {
            // Up to the moment it is hit back, the spot was fully showing on the hitter's half.
            if (m.spot && m.spot.fade === null) {
              expect(e.p === 0 ? m.spot.y > MID : m.spot.y < MID, 'spot is on the side that hits it back').toBe(true);
              expect(m.alpha()).toBe(1);
            }
            m.release();
          } else if (e.type === 'table') {
            landings++;
            m.land(e.x, e.y, '#fff');
          } else if (e.type === 'point') m.clear();
        }
        t += DT;
      }
    }
    expect(landings).toBeGreaterThan(50);
  });
});
