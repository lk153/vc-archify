import { expect, test } from '@playwright/test';
import { fileMatchesName, fileNameFor, fileNameState } from '../components/playground/library';

// Synced file names follow the diagram's name (no browser needed).

const diagram = (name: string, type: string | null = 'workflow') => ({ name, type });

test.describe('synced file names', () => {
  test('a file name is derived from the name and type, with a suffix when taken', () => {
    expect(fileNameFor(diagram('Decision tree within Chorus'), new Set())).toBe('decision-tree-within-chorus.workflow.json');
    expect(fileNameFor(diagram('Plan'), new Set(['plan.workflow.json']))).toBe('plan.workflow-2.json');
    expect(fileMatchesName('plan.workflow-2.json', diagram('Plan'))).toBe(true);
    expect(fileMatchesName('diagrams/Plan.workflow.json', diagram('plan'))).toBe(true);
    expect(fileMatchesName('planning.workflow.json', diagram('Plan'))).toBe(false);
  });

  test('a link follows renames made after it was created', () => {
    const link = { file: 'untitled-workflow-diagram.workflow.json', name: 'Untitled workflow diagram' };
    expect(fileNameState(link, diagram('Untitled workflow diagram'))).toBe('ok');
    expect(fileNameState(link, diagram('decision-tree-within-chorus'))).toBe('rename');
    // A rename that keeps the same file name only updates the link.
    expect(fileNameState(link, diagram('Untitled Workflow Diagram'))).toBe('stamp');
    // A file someone else named keeps its name until the diagram is renamed here.
    expect(fileNameState({ file: 'notes.json', name: 'Notes' }, diagram('Notes'))).toBe('ok');
    expect(fileNameState({ file: 'notes.json', name: 'Notes' }, diagram('Team notes'))).toBe('rename');
    // While the name field is empty, nothing moves.
    expect(fileNameState(link, diagram('  '))).toBe('ok');
  });

  test('links saved before they remembered a name', () => {
    // The app named this file after an earlier name: rename it.
    expect(fileNameState({ file: 'untitled-workflow-diagram.workflow.json' }, diagram('decision-tree-within-chorus'))).toBe('rename');
    expect(fileNameState({ path: 'diagrams/untitled.workflow.json' }, diagram('Release flow'))).toBe('rename');
    // Already matching, or named by someone else: keep the file, remember the name.
    expect(fileNameState({ file: 'release-flow.workflow.json' }, diagram('Release flow'))).toBe('stamp');
    expect(fileNameState({ file: 'my-notes.json' }, diagram('Release flow'))).toBe('stamp');
  });
});
