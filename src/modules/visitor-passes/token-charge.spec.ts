import { lagosDayStart, tokenAllowance } from './token-charge';

const settings = { enabled: true, allowanceRegular: 5, allowanceCommercial: 20, priceRegular: 500, priceCommercial: 300 };

describe('visitor token allowance', () => {
  it('within the free allowance nothing is charged', () => {
    const a = tokenAllowance(settings, 'REGULAR', 4);
    expect(a.freeRemaining).toBe(1);
    expect(a.nextTokenPrice).toBe(0);
  });

  it('once the allowance is used the next token costs the extra price', () => {
    expect(tokenAllowance(settings, 'REGULAR', 5).nextTokenPrice).toBe(500);
    expect(tokenAllowance(settings, 'REGULAR', 9).nextTokenPrice).toBe(500);
  });

  it('commercial residents have their own allowance and price', () => {
    expect(tokenAllowance(settings, 'COMMERCIAL', 19).nextTokenPrice).toBe(0);
    expect(tokenAllowance(settings, 'COMMERCIAL', 20).nextTokenPrice).toBe(300);
  });

  it('a zero price means extra tokens stay free', () => {
    expect(tokenAllowance({ ...settings, priceRegular: 0 }, 'REGULAR', 50).nextTokenPrice).toBe(0);
  });

  it('nothing is ever charged while the feature is off', () => {
    const a = tokenAllowance({ ...settings, enabled: false }, 'REGULAR', 50);
    expect(a.enabled).toBe(false);
    expect(a.nextTokenPrice).toBe(0);
  });

  it("the token day starts at Lagos midnight, i.e. 23:00 UTC the evening before", () => {
    expect(lagosDayStart(2026, 9, 19).toISOString()).toBe('2026-09-18T23:00:00.000Z');
  });
});
