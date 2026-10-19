import { useState } from 'react';
import { testKey, type KeyTarget } from './test-key';

// A "Test key" button with its result next to it.
export function KeyTester({ target, apiKey }: { target: KeyTarget; apiKey: string }) {
  const [state, setState] = useState<{ kind: 'idle' | 'wait' | 'ok' | 'bad'; message?: string }>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'wait', message: 'Testing...' });
    const result = await testKey(target, apiKey);
    setState({ kind: result.ok ? 'ok' : 'bad', message: result.message });
  }

  return (
    <div className="row">
      <button type="button" onClick={run} disabled={state.kind === 'wait'}>
        Test key
      </button>
      {state.kind !== 'idle' && <span className={`status ${state.kind}`}>{state.message}</span>}
    </div>
  );
}
