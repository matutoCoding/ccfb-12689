// 首次启动种子数据
import type { DisplayTemplate, LayoutItem, MannequinSeries, Prop, WindowProfile } from '../types';
import { uid } from '../engine/math';

const now = Date.now();

export function seedProps(): Prop[] {
  const mk = (p: Partial<Prop> & Pick<Prop, 'name' | 'category' | 'size'>): Prop => ({
    id: uid('prop'),
    volume: 2,
    material: {
      category: p.category,
      color: p.material?.color ?? [0.7, 0.7, 0.7],
      roughness: p.material?.roughness ?? 0.6,
      opacity: p.material?.opacity ?? 1,
      texture: p.material?.texture,
      lightbox: p.material?.lightbox,
    },
    packMethod: p.packMethod ?? 'integral',
    packSize: p.packSize ?? { ...p.size },
    weight: p.weight ?? 8,
    slotMountable: p.slotMountable ?? false,
    tags: p.tags ?? [],
    createdAt: now,
    ...p,
  });

  return [
    mk({
      name: '亚克力立体字 LOGO', category: 'acrylic', volume: 2,
      size: { w: 1200, h: 350, d: 80 }, packMethod: 'detachable',
      packSize: { w: 1250, h: 400, d: 120 }, weight: 6, slotMountable: true,
      tags: ['招牌', '透明'],
      material: { category: 'acrylic', color: [0.85, 0.92, 0.98], roughness: 0.08, opacity: 0.35 },
    }),
    mk({
      name: '亚克力展示台 600', category: 'acrylic', volume: 3,
      size: { w: 600, h: 900, d: 600 }, packMethod: 'detachable',
      packSize: { w: 650, h: 950, d: 150 }, weight: 12,
      tags: ['展台', '透明'],
      material: { category: 'acrylic', color: [0.9, 0.95, 1], roughness: 0.1, opacity: 0.45 },
    }),
    mk({
      name: '木质中岛展台', category: 'wood', volume: 4,
      size: { w: 1200, h: 750, d: 900 }, packMethod: 'foldable',
      packSize: { w: 1250, h: 800, d: 180 }, weight: 28,
      tags: ['中岛', '原木'],
      material: { category: 'wood', color: [0.66, 0.46, 0.29], roughness: 0.7, texture: { woodGrain: true } },
    }),
    mk({
      name: '木质层架 三层', category: 'wood', volume: 3,
      size: { w: 1000, h: 1400, d: 350 }, packMethod: 'detachable',
      packSize: { w: 1050, h: 1450, d: 200 }, weight: 22, slotMountable: true,
      tags: ['层架', '原木'],
      material: { category: 'wood', color: [0.6, 0.42, 0.27], roughness: 0.65, texture: { woodGrain: true } },
    }),
    mk({
      name: 'KT 主题背板 大幅', category: 'kt', volume: 2,
      size: { w: 3600, h: 2400, d: 5 }, packMethod: 'flat',
      packSize: { w: 1200, h: 2400, d: 60 }, weight: 7, slotMountable: true,
      tags: ['背板', '画面'],
      material: { category: 'kt', color: [0.83, 0.36, 0.42], roughness: 0.85, texture: { ktGrain: 1 } },
    }),
    mk({
      name: 'KT 异形立牌', category: 'kt', volume: 1,
      size: { w: 700, h: 1800, d: 5 }, packMethod: 'flat',
      packSize: { w: 750, h: 1850, d: 40 }, weight: 3,
      tags: ['立牌', '引导'],
      material: { category: 'kt', color: [0.95, 0.78, 0.35], roughness: 0.9, texture: { ktGrain: 0.8 } },
    }),
    mk({
      name: '灯箱画面 A 款', category: 'lightbox', volume: 4,
      size: { w: 1500, h: 2000, d: 120 }, packMethod: 'integral',
      packSize: { w: 1550, h: 2050, d: 180 }, weight: 35, slotMountable: true,
      tags: ['灯箱', '发光'],
      material: {
        category: 'lightbox', color: [0.95, 0.85, 0.7], roughness: 0.4,
        lightbox: { onColor: [1.2, 0.95, 0.7], power: 1.1 },
      },
    }),
    mk({
      name: '灯箱软膜 横版', category: 'lightbox', volume: 3,
      size: { w: 2400, h: 900, d: 100 }, packMethod: 'detachable',
      packSize: { w: 2450, h: 950, d: 160 }, weight: 24, slotMountable: true,
      tags: ['灯箱', '横版'],
      material: {
        category: 'lightbox', color: [0.6, 0.75, 0.95], roughness: 0.4,
        lightbox: { onColor: [0.7, 0.9, 1.3], power: 1.0 },
      },
    }),
    mk({
      name: '镀铬挂衣架 1.8m', category: 'chrome', volume: 3,
      size: { w: 1800, h: 1600, d: 450 }, packMethod: 'detachable',
      packSize: { w: 1850, h: 200, d: 120 }, weight: 18,
      tags: ['挂装', '金属'],
      material: { category: 'chrome', color: [0.85, 0.85, 0.88], roughness: 0.12 },
    }),
    mk({
      name: '镀铬小圆桌', category: 'chrome', volume: 2,
      size: { w: 700, h: 700, d: 700 }, packMethod: 'detachable',
      packSize: { w: 750, h: 750, d: 150 }, weight: 10,
      tags: ['桌台', '金属'],
      material: { category: 'chrome', color: [0.82, 0.82, 0.85], roughness: 0.15 },
    }),
    mk({
      name: '绒布叠装台', category: 'velvet', volume: 3,
      size: { w: 900, h: 900, d: 700 }, packMethod: 'integral',
      packSize: { w: 950, h: 950, d: 750 }, weight: 15,
      tags: ['叠装', '绒面'],
      material: { category: 'velvet', color: [0.35, 0.14, 0.21], roughness: 0.9, texture: { velvet: true } },
    }),
    mk({
      name: '织物软包墩', category: 'fabric', volume: 2,
      size: { w: 500, h: 450, d: 500 }, packMethod: 'foldable',
      packSize: { w: 550, h: 200, d: 550 }, weight: 5,
      tags: ['软装'],
      material: { category: 'fabric', color: [0.55, 0.5, 0.46], roughness: 0.95, texture: { fabric: true } },
    }),
  ];
}

export function seedSeries(): MannequinSeries[] {
  return [
    { id: uid('series'), name: '都市通勤系列', colorTag: '驼色', color: '#b08968', count: 3, spacing: 900, createdAt: now },
    { id: uid('series'), name: '暗夜派对系列', colorTag: '黑色', color: '#2b2d42', count: 2, spacing: 850, createdAt: now },
    { id: uid('series'), name: '假日休闲系列', colorTag: '米白', color: '#e6dcc8', count: 4, spacing: 800, createdAt: now },
  ];
}

export function seedProfiles(): WindowProfile[] {
  const mk = (p: Partial<WindowProfile> & Pick<WindowProfile, 'storeCode' | 'storeName' | 'width' | 'depth' | 'height'>): WindowProfile => ({
    id: uid('win'),
    city: '上海',
    environment: 'mall',
    platformHeight: 150,
    door: { w: 900, h: 2100 },
    elevator: { w: 1100, h: 2200, d: 1500 },
    walkwayWidth: 2400,
    oppositeDistance: 6000,
    slotHeights: [600, 1200, 1800],
    tags: [],
    createdAt: now,
    ...p,
  });
  return [
    mk({ storeCode: 'SH001', storeName: '南京西路旗舰店', city: '上海', environment: 'street',
      width: 4800, depth: 1800, height: 3000, tags: ['旗舰', '临街'], walkwayWidth: 3200, oppositeDistance: 8000 }),
    mk({ storeCode: 'SH023', storeName: '环球港中庭店', city: '上海', environment: 'atrium',
      width: 3600, depth: 1500, height: 2700, tags: ['中庭', '岛柜'], walkwayWidth: 1800, oppositeDistance: 4000 }),
    mk({ storeCode: 'BJ108', storeName: '朝阳大悦城店', city: '北京', environment: 'mall',
      width: 4200, depth: 1600, height: 2800, tags: ['商场内铺'], door: { w: 850, h: 2050 } }),
    mk({ storeCode: 'GZ056', storeName: '天环广场店', city: '广州', environment: 'mall',
      width: 3200, depth: 1400, height: 2600, tags: ['小橱窗'], door: { w: 800, h: 2000 },
      elevator: { w: 1000, h: 2000, d: 1400 } }),
    mk({ storeCode: 'CD077', storeName: '太古里临街店', city: '成都', environment: 'street',
      width: 5200, depth: 2000, height: 3200, tags: ['旗舰', '临街'], walkwayWidth: 3000 }),
  ];
}

export function seedTemplates(props: Prop[]): DisplayTemplate[] {
  const find = (name: string) => props.find((p) => p.name.includes(name))!;
  const item = (refId: string, name: string, nx: number, nz: number, flags: LayoutItem['flags'] = []): import('../types').TemplateItem => ({
    type: 'prop', refId, name, nx, nz, rotation: 0, flipped: false, flags,
  });
  return [
    {
      id: uid('tpl'), name: '极简留白', style: 'minimal',
      description: '少道具大留白，单个主推焦点 + 一组模特',
      items: [
        { ...item(find('亚克力展示台').id, '亚克力展示台', 0.5, 0.45, ['main']) },
        { ...item(find('镀铬挂衣架').id, '镀铬挂衣架', 0.2, 0.25) },
        { ...item(find('KT 异形立牌').id, 'KT 异形立牌', 0.82, 0.3, ['accessory']) },
      ],
    },
    {
      id: uid('tpl'), name: '节庆氛围', style: 'festive',
      description: '灯箱+大幅 KT 画面+多点陈列，适合大促档期',
      items: [
        { ...item(find('KT 主题背板').id, 'KT 主题背板', 0.5, 0.08) },
        { ...item(find('灯箱画面').id, '灯箱画面 A 款', 0.25, 0.3, ['main']) },
        { ...item(find('灯箱软膜').id, '灯箱软膜 横版', 0.75, 0.28) },
        { ...item(find('木质中岛').id, '木质中岛展台', 0.5, 0.7) },
        { ...item(find('织物软包').id, '织物软包墩', 0.18, 0.65, ['accessory']) },
      ],
    },
    {
      id: uid('tpl'), name: '轻奢质感', style: 'luxury',
      description: '亚克力+镀铬+绒布，材质对比突出高级感',
      items: [
        { ...item(find('亚克力立体字').id, '亚克力立体字 LOGO', 0.5, 0.12) },
        { ...item(find('镀铬小圆桌').id, '镀铬小圆桌', 0.3, 0.5, ['main']) },
        { ...item(find('绒布叠装台').id, '绒布叠装台', 0.7, 0.55) },
        { ...item(find('木质层架').id, '木质层架 三层', 0.12, 0.3) },
      ],
    },
  ];
}
