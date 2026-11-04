import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../shared/options';
import { toManifest, tools } from '.';

describe('tool registry', () => {
  it.each(tools.map((t) => [t.id, t] as const))(
    '%s has a manifest that can cross IPC',
    (_id, tool) => {
      // IPC uses structured clone, which throws on functions.
      expect(() => structuredClone(toManifest(tool))).not.toThrow();
    },
  );

  it('has unique ids', () => {
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
  });

  it.each(tools.map((t) => [t.id, t] as const))(
    '%s defaults and presets are valid',
    (_id, tool) => {
      expect(resolveOptions(tool.options)).toEqual(
        Object.fromEntries(tool.options.map((f) => [f.key, f.default])),
      );
      for (const preset of tool.presets ?? []) {
        expect(resolveOptions(tool.options, preset.values)).toMatchObject(
          preset.values,
        );
      }
    },
  );
});
