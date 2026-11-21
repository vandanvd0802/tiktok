/** What the scene needs from anything that stands on the floor: the human DJ (Dancer) or an animal viewer. */
import type * as THREE from 'three';

export type DanceStyle = 'pump' | 'handsUp' | 'groove' | 'clap' | 'shuffle' | 'dj';

export type PendingWalk = { path: THREE.Vector3[]; onArrive?: () => void };

export interface Actor {
  readonly root: THREE.Group;
  readonly isWalking: boolean;
  style: DanceStyle;
  facing: number;
  energy: number;
  baseY: number;
  /** true while on the stage: animals then dance non-stop */
  onStage: boolean;
  walkTo(points: THREE.Vector3[], onArrive?: () => void): void;
  /** the walk still in progress (so a new body can carry on with it), if any */
  pendingWalk(): PendingWalk | null;
  jump(delay?: number): void;
  update(dt: number, beat: number): void;
  headPosition(target: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}
