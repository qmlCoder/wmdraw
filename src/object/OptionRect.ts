import { Rect } from './Rect';
import { Vec2 } from '../types';
import { Scene } from '../scene';

export class OptionRect extends Rect {
  constructor(scene: Scene, position: Vec2, width: number, height: number) {
    super(scene, position, width, height);
  }

  draw() {
    super.draw();

  }
}
