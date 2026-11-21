/** Test button for the animal skins: sends a comment with the chosen animal word as a made-up viewer. */
import { useState } from 'react';
import type { StageCommand } from '../../../shared/contracts';
import { ANIMAL_ALIASES, ANIMAL_IDS, type AnimalId } from '../../domain/animalSkins';
import { ANIMAL_COMMANDS, HUMAN_COMMANDS } from '../../domain/skins';
import { Panel, primary, secondary } from './controls';

const RANDOM_WORDS: readonly string[] = [...HUMAN_COMMANDS, ...ANIMAL_COMMANDS];

const TEST_VIEWER = 'Khách Thú';

type Props = { onSend: (cmd: StageCommand, done?: string) => unknown };

export function AnimalTestPanel({ onSend }: Props) {
  const [animal, setAnimal] = useState<AnimalId>(ANIMAL_IDS[0]);
  const words = ANIMAL_ALIASES[animal];
  return (
    <Panel title="Thử đổi skin">
      <div className="flex flex-wrap gap-2">
        {RANDOM_WORDS.map((word) => (
          <button key={word} className={secondary} onClick={() => onSend({ action: 'testComment', name: TEST_VIEWER, text: word }, `“${TEST_VIEWER}” comment “${word}”`)}>
            💬 {word}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <select className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white" value={animal} onChange={(e) => setAnimal(e.target.value as AnimalId)}>
          {ANIMAL_IDS.map((id) => (
            <option key={id} value={id}>
              {ANIMAL_ALIASES[id][0]} ({id})
            </option>
          ))}
        </select>
        <button className={primary} onClick={() => onSend({ action: 'testComment', name: TEST_VIEWER, text: words[0] }, `“${TEST_VIEWER}” đổi thành ${words[0]}`)}>
          💬 Comment “{words[0]}”
        </button>
      </div>
      <p className="text-xs text-white/40">Cùng một khách “{TEST_VIEWER}” đổi qua lại. Từ khóa khác cũng được: {words.join(', ')}. Chỉ chạy trên trang live (?view=stage) đang mở.</p>
    </Panel>
  );
}
