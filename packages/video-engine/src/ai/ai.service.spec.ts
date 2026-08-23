import { describe, expect, it } from 'vitest';
import { AiService } from './ai.service.js';

describe('AiService keyless story script', () => {
  it('turns a long Arabic story prompt into four short caption-safe beats', async () => {
    const service = new AiService(
      {} as never,
      { resolveLlm: async () => null } as never,
    );
    const keyword =
      'في صحراء مستقبلية غمرها الغبار، يستيقظ روبوت صغير وحيد ويعثر على بذرة زرقاء نابضة بالضوء. ' +
      'يسير بها عبر عاصفة رملية هائلة، يحميها بجسده حتى يصل إلى بئر جاف. ' +
      'يزرع البذرة، فتندفع المياه وتعود الأشجار والطيور إلى الواحة. ' +
      'حركة سينمائية واقعية مستمرة، بدون نصوص مكتوبة.';

    const result = await service.generateScript(
      { keyword, niche: 'قصة سينمائية', language: 'ar', targetSeconds: 20 },
      'test-org',
    );

    expect(result.provider).toBe('keyless-template');
    expect(result.script.scenes).toHaveLength(4);
    expect(result.script.scenes.every((scene) => scene.narration.split(/\s+/).length <= 12)).toBe(true);
    expect(result.script.scenes.map((scene) => scene.narration).join(' ')).not.toContain('بدون نصوص مكتوبة');
    expect(result.script.scenes[0]?.narration).toContain('روبوت');
    expect(result.script.scenes[3]?.narration).toContain('المياه');
  });
});
