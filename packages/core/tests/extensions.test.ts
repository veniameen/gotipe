import { describe, it, expect } from 'vitest';
import { GoTipeError } from '../src/error';
import { DefaultPreset } from '../src/presets';
import { defineExtension } from '../src/types/extension';
import { ENGINES, createOn } from './engines';

describe('defineExtension', () => {
  it('should create an extension with name', () => {
    const ext = defineExtension({ name: 'test' });
    expect(ext.name).toBe('test');
  });

  it('should support configure()', () => {
    const ext = defineExtension<{ level: number }>({
      name: 'heading',
      options: { level: 1 },
    });
    const configured = ext.configure({ level: 3 });
    expect(configured.options).toEqual({ level: 3 });
    expect(configured.name).toBe('heading');
  });

  it('should merge options on configure', () => {
    interface TestOptions { a: string; b: number }
    const ext = defineExtension<TestOptions>({
      name: 'test',
      options: { a: 'hello', b: 1 },
    });
    const configured = ext.configure({ b: 2 });
    expect(configured.options).toEqual({ a: 'hello', b: 2 });
  });

  it('should support dependencies', () => {
    const ext = defineExtension({
      name: 'test',
      dependencies: ['paragraph', 'bold'],
    });
    expect(ext.dependencies).toEqual(['paragraph', 'bold']);
  });

  it('should support nodes and marks', () => {
    const ext = defineExtension({
      name: 'test',
      nodes: [
        { name: 'test', group: ['block'], content: 'richText', attrs: {}, topLevel: true, marksAllowed: 'all', leaf: false, allowsChildren: false },
      ],
      marks: [
        { name: 'testMark', attrs: {}, rank: 1 },
      ],
    });
    expect(ext.nodes).toHaveLength(1);
    expect(ext.marks).toHaveLength(1);
  });
});

describe('editor.hasExtension', () => {
  for (const engine of ENGINES)
    it(`names the extensions the editor was created with (${engine})`, async () => {
      const own = defineExtension({ name: 'own', dependencies: ['paragraph'] });
      const editor = await createOn(engine, { extensions: [DefaultPreset, [own]] });
      // Alone, nested in an array, or in a preset.
      expect(editor.hasExtension('own')).toBe(true);
      expect(editor.hasExtension('paragraph')).toBe(true);
      expect(editor.hasExtension('ai')).toBe(false);
      expect(editor.hasExtension('')).toBe(false);
      editor.destroy();
    });
});

describe.each(ENGINES)('%s engine: extension dependencies (D-13)', (engine) => {
  it('a dependency nobody passed rejects createEditor and names both extensions', async () => {
    const created: string[] = [];
    const own = defineExtension({
      name: 'own',
      dependencies: ['paragraph', 'missing'],
      onCreate: () => void created.push('own'),
    });
    const error = await createOn(engine, { extensions: [DefaultPreset, own] }).catch((e) => e);
    expect(error).toBeInstanceOf(GoTipeError);
    expect(error).toMatchObject({
      code: 'EXTENSION_ERROR',
      message: 'Extension own needs missing, which is not in the extension list',
      details: { extension: 'own', dependency: 'missing' },
    });
    expect(created).toEqual([]);
  });

  it('a dependency passed after the extension is set up before it', async () => {
    const created: string[] = [];
    const own = defineExtension({
      name: 'own',
      dependencies: ['base'],
      onCreate: () => void created.push('own'),
    });
    const base = defineExtension({ name: 'base', onCreate: () => void created.push('base') });
    const editor = await createOn(engine, { extensions: [DefaultPreset, own, base] });
    expect(created).toEqual(['base', 'own']);
    editor.destroy();
  });
});
