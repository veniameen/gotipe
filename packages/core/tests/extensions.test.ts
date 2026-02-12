import { describe, it, expect } from 'vitest';
import { defineExtension } from '../src/types/extension';

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
