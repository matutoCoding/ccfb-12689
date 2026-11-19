import type { Kit, MannequinGroup, Material, StoreWindow } from '../types';
import { uid, nowTs } from '../lib/math';

export const SEED_MATERIALS: Material[] = [
  { id: 'mat-seed-plinth', name: '亚克力悬浮展台 A', sku: 'ACR-001', category: 'acrylic', surface: 'acrylic', size: { w: 50, h: 90, d: 50 }, weight: 8, color: [0.85, 0.9, 0.95], fold: 'none', canStack: true, canFlip: false, wallSlot: false, hueTag: '米白', updatedAt: nowTs() },
  { id: 'mat-seed-lightbox', name: '主题软膜灯箱 180×120', sku: 'LB-201', category: 'lightbox', surface: 'lightbox', size: { w: 180, h: 120, d: 12 }, weight: 14, color: [0.9, 0.2, 0.3], fold: 'detach', canStack: false, canFlip: false, wallSlot: true, hueTag: '红', updatedAt: nowTs() },
  { id: 'mat-seed-rail', name: '镀铬横杆挂架 160高', sku: 'RL-110', category: 'metal', surface: 'chrome', size: { w: 160, h: 160, d: 40 }, weight: 12, color: [0.8, 0.8, 0.82], fold: 'detach', canStack: false, canFlip: false, wallSlot: false, updatedAt: nowTs() },
  { id: 'mat-seed-tower', name: '木质叠装塔 70宽', sku: 'WD-330', category: 'wood', surface: 'wood', size: { w: 70, h: 140, d: 50 }, weight: 22, color: [0.55, 0.4, 0.28], color2: [0.38, 0.26, 0.16], fold: 'detach', canStack: true, canFlip: false, wallSlot: false, updatedAt: nowTs() },
  { id: 'mat-seed-chrome', name: '镀铬圆形边几', sku: 'CR-050', category: 'metal', surface: 'chrome', size: { w: 45, h: 58, d: 45 }, weight: 9, color: [0.82, 0.82, 0.85], fold: 'none', canStack: true, canFlip: false, wallSlot: false, hueTag: '银', updatedAt: nowTs() },
  { id: 'mat-seed-velvet', name: '绒布展示台面', sku: 'VL-080', category: 'fabric', surface: 'velvet', size: { w: 60, h: 12, d: 40 }, weight: 3, color: [0.12, 0.28, 0.22], color2: [0.3, 0.5, 0.4], fold: 'fold', canStack: true, canFlip: true, wallSlot: false, hueTag: '墨绿', isAccessory: true, updatedAt: nowTs() },
  { id: 'mat-seed-kt', name: 'KT 主题背板(整幅)', sku: 'KT-001', category: 'kt', surface: 'matte', size: { w: 360, h: 240, d: 0.5 }, weight: 6, color: [0.92, 0.88, 0.8], fold: 'roll', canStack: false, canFlip: false, wallSlot: true, hueTag: '米白', updatedAt: nowTs() },
  { id: 'mat-seed-woodwall', name: '木质格栅背景墙', sku: 'WD-410', category: 'wood', surface: 'wood', size: { w: 240, h: 220, d: 10 }, weight: 45, color: [0.5, 0.36, 0.24], color2: [0.32, 0.22, 0.14], fold: 'detach', canStack: false, canFlip: false, wallSlot: true, updatedAt: nowTs() },
  { id: 'mat-seed-acrylic-word', name: '亚克力发光字(整套)', sku: 'ACR-120', category: 'acrylic', surface: 'acrylic', size: { w: 120, h: 40, d: 8 }, weight: 4, color: [0.95, 0.8, 0.5], fold: 'none', canStack: true, canFlip: false, wallSlot: true, updatedAt: nowTs() },
  { id: 'mat-seed-plinth2', name: '哑光几何体展台 B', sku: 'PL-002', category: 'other', surface: 'matte', size: { w: 40, h: 60, d: 40 }, weight: 10, color: [0.7, 0.68, 0.65], fold: 'none', canStack: true, canFlip: false, wallSlot: false, updatedAt: nowTs() },
  { id: 'mat-seed-oversize', name: '超大异形装置(超限样件)', sku: 'OS-999', category: 'other', surface: 'plastic', size: { w: 260, h: 230, d: 90 }, weight: 60, color: [0.6, 0.4, 0.7], fold: 'none', canStack: false, canFlip: false, wallSlot: false, updatedAt: nowTs() },
];

export const SEED_GROUPS: MannequinGroup[] = [
  {
    id: 'grp-seed-1', name: '静谧系列三人组', series: '静谧', spacing: 90, updatedAt: nowTs(),
    mannequins: [
      { id: uid('mn'), offsetX: -90, offsetZ: 0, rotationY: 0.12, pose: 'stand', hueTag: '米白' },
      { id: uid('mn'), offsetX: 0, offsetZ: 8, rotationY: 0, pose: 'stand', hueTag: '灰' },
      { id: uid('mn'), offsetX: 90, offsetZ: 0, rotationY: -0.12, pose: 'stand', hueTag: '米白' },
    ],
  },
  {
    id: 'grp-seed-2', name: '庆典系列单人', series: '庆典', spacing: 0, updatedAt: nowTs(),
    mannequins: [{ id: uid('mn'), offsetX: 0, offsetZ: 0, rotationY: 0.15, pose: 'stand', hueTag: '红' }],
  },
];

export const SEED_KITS: Kit[] = [
  {
    id: 'kit-seed-1', name: '入口焦点套件', tags: ['主推', '通用'], updatedAt: nowTs(),
    items: [
      { id: uid('ki'), kind: 'mannequinGroup', refId: 'grp-seed-2', name: '庆典系列单人', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, isHero: true, hueTag: '红', mannequins: SEED_GROUPS[1].mannequins.map((m) => ({ ...m })) },
      { id: uid('ki'), kind: 'material', refId: 'mat-seed-chrome', name: '镀铬圆形边几', position: { x: 70, y: 0, z: 10 }, rotationY: 0, scale: 1, isAccessory: true },
    ],
  },
];

export function seedWindows(): StoreWindow[] {
  const base = (id: string, storeName: string, city: string, locationType: StoreWindow['locationType'],
    width: number, depth: number, height: number, doorW = 120, doorH = 220): StoreWindow => ({
    id, storeName, city, locationType,
    width, depth, height, platformHeight: 12,
    door: { w: doorW, h: doorH },
    elevator: { w: 150, h: 230, d: 160 },
    aisleWidth: locationType === 'island' ? 240 : 320,
    oppositeDistance: locationType === 'street' ? 800 : 450,
    env: { locationType, aisleWidth: 320, oppositeDistance: 450, fog: 0.15, oppositeReflection: true, lightboxPower: true },
    updatedAt: nowTs(),
  });
  return [
    base('win-seed-1', '上海恒隆旗舰店', '上海', 'mall', 420, 180, 280, 140, 240),
    base('win-seed-2', '北京西单店', '北京', 'mall', 360, 150, 260),
    base('win-seed-3', '杭州湖滨步行街店', '杭州', 'street', 480, 200, 300, 150, 250),
    base('win-seed-4', '成都太古里中庭柜', '成都', 'island', 300, 160, 240, 100, 210),
    base('win-seed-5', '广州天河城店', '广州', 'mall', 380, 160, 270),
    base('win-seed-6', '深圳万象天地店', '深圳', 'street', 440, 190, 290),
    base('win-seed-7', '南京德基店', '南京', 'mall', 340, 140, 250, 95, 210),
    base('win-seed-8', '武汉光谷店', '武汉', 'mall', 400, 170, 265),
  ];
}
