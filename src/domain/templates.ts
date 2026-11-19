import type { PlacedItem, StoreWindow } from '../types';
import { uid, v3 } from '../lib/math';

export interface DisplayTemplate {
  id: string;
  name: string;
  desc: string;
  build: (win: StoreWindow) => { items: PlacedItem[]; teachingTarget: PlacedItem[] };
}

function pi(partial: Partial<PlacedItem> & Pick<PlacedItem, 'refId' | 'name' | 'kind'>, x: number, z: number, y?: number): PlacedItem {
  return {
    id: uid('pi'),
    position: v3(x, y ?? 0, z),
    rotationY: 0,
    scale: 1,
    ...partial,
  };
}

// 未显式给高度的道具统一落到地台面
function onFloor(win: StoreWindow, items: PlacedItem[]): PlacedItem[] {
  for (const it of items) {
    if (it.position.y === 0 && !it.wallMount) it.position.y = win.platformHeight;
  }
  return items;
}

// 极简:疏朗三点式,中性色,一个主推
const minimal: DisplayTemplate = {
  id: 'tpl-minimal',
  name: '极简',
  desc: '大留白、三点式构图、中性色系,主推款居中',
  build: (win) => {
    const z = win.depth / 2 - 80;
    const items: PlacedItem[] = [
      pi({ kind: 'mannequinGroup', refId: 'grp-seed-1', name: '模特组·静谧系列', isHero: true, hueTag: '米白', mannequins: [{ id: uid('mn'), offsetX: 0, offsetZ: 0, rotationY: 0, pose: 'stand' }] }, 0, z),
      pi({ kind: 'material', refId: 'mat-seed-plinth', name: '亚克力展台', hueTag: '米白' }, -win.width * 0.28, z + 10),
      pi({ kind: 'material', refId: 'mat-seed-plinth', name: '亚克力展台', hueTag: '灰', isAccessory: true }, win.width * 0.28, z + 10),
    ];
    onFloor(win, items);
    return { items, teachingTarget: items.map((i) => ({ ...i, id: uid('tg') })) };
  },
};

// 节庆:灯箱 + 红色系满铺 + 挂杆
const festive: DisplayTemplate = {
  id: 'tpl-festive',
  name: '节庆',
  desc: '高饱和红色系、灯箱门头、挂杆满挂,氛围浓烈',
  build: (win) => {
    const back = -win.depth / 2 + 20;
    const items: PlacedItem[] = [
      pi({ kind: 'material', refId: 'mat-seed-lightbox', name: '主题灯箱', wallMount: true }, 0, back, win.platformHeight + win.height - 160),
      pi({ kind: 'material', refId: 'mat-seed-rail', name: '横杆挂装·节庆', rail: { spacing: 8, garments: 12, hueTags: ['红', '红', '金', '红', '红', '金', '红', '红', '金', '红', '金', '红'] }, isHero: true, hueTag: '红' }, -win.width * 0.2, back + 30),
      pi({ kind: 'material', refId: 'mat-seed-tower', name: '叠装塔', tower: { levels: 5, levelHeight: 26 }, hueTag: '金', isAccessory: true }, win.width * 0.25, back + 20),
      pi({ kind: 'mannequinGroup', refId: 'grp-seed-2', name: '模特组·庆典系列', hueTag: '红', mannequins: [{ id: uid('mn'), offsetX: 0, offsetZ: 0, rotationY: 0.15, pose: 'stand' }] }, 0, win.depth / 2 - 70),
    ];
    onFloor(win, items);
    return { items, teachingTarget: items.map((i) => ({ ...i, id: uid('tg') })) };
  },
};

// 轻奢:镀铬 + 绒布 + 低饱和,对称构图
const luxury: DisplayTemplate = {
  id: 'tpl-luxury',
  name: '轻奢',
  desc: '镀铬金属、绒布台面、对称构图,低饱和高级色',
  build: (win) => {
    const z = win.depth / 2 - 90;
    const items: PlacedItem[] = [
      pi({ kind: 'mannequinGroup', refId: 'grp-seed-1', name: '模特组·臻选系列', isHero: true, hueTag: '驼', mannequins: [{ id: uid('mn'), offsetX: 0, offsetZ: 0, rotationY: 0, pose: 'stand' }] }, 0, z),
      pi({ kind: 'material', refId: 'mat-seed-chrome', name: '镀铬边几', hueTag: '银' }, -win.width * 0.24, z + 15),
      pi({ kind: 'material', refId: 'mat-seed-chrome', name: '镀铬边几', hueTag: '银' }, win.width * 0.24, z + 15),
      pi({ kind: 'material', refId: 'mat-seed-velvet', name: '绒布台面', hueTag: '墨绿', isAccessory: true }, -win.width * 0.24, z + 15, win.platformHeight + 60),
      pi({ kind: 'material', refId: 'mat-seed-velvet', name: '绒布台面', hueTag: '墨绿', isAccessory: true }, win.width * 0.24, z + 15, win.platformHeight + 60),
    ];
    onFloor(win, items);
    return { items, teachingTarget: items.map((i) => ({ ...i, id: uid('tg') })) };
  },
};

export const TEMPLATES: DisplayTemplate[] = [minimal, festive, luxury];
