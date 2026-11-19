// 全局领域模型 —— 所有尺寸单位均为厘米(cm),角度内部用弧度
export type ID = string;
export type RGB = [number, number, number];

export type Season = '春' | '夏' | '秋' | '冬' | '全季';
export type Slot =
  | '常规' | '春节' | '情人节' | '五一' | '母亲节' | '618'
  | '七夕' | '中秋' | '国庆' | '双11' | '圣诞' | '元旦';
export type SchemeStatus = 'draft' | 'confirmed' | 'archived';
export type LocationType = 'mall' | 'street' | 'island';
export type MaterialCategory = 'acrylic' | 'wood' | 'kt' | 'lightbox' | 'metal' | 'fabric' | 'other';
export type SurfaceType =
  | 'matte'        // KT 板覆膜:亚光颗粒
  | 'acrylic'      // 亚克力:边缘高光 + 透明层次
  | 'wood'         // 木质:纹理拼接缝
  | 'chrome'       // 镀铬:环境倒影
  | 'velvet'       // 绒布:随角度变化的绒感
  | 'lightbox'     // 灯箱:通电饱和 / 断电发灰
  | 'plastic'      // 普通塑料
  | 'metal'        // 普通金属
  | 'glass'        // 玻璃
  | 'skin';        // 模特
export type FoldType = 'none' | 'fold' | 'detach' | 'roll';

export interface Vec3 { x: number; y: number; z: number; }
export interface Size3 { w: number; h: number; d: number; }

export interface AABB { min: Vec3; max: Vec3; }

export interface PanelPiece {
  code: string;          // 编号 如 KT-A1
  w: number; h: number;  // 分块尺寸
  x: number; y: number;  // 在背板墙上的左下角偏移
}

export interface RailConfig {
  spacing: number;       // 件间距 cm
  garments: number;      // 当前挂装件数(容量按横杆长度自动算)
  hueTags: string[];     // 每件色系,用于色彩节奏规则
}

export interface TowerConfig {
  levels: number;        // 层数
  levelHeight: number;   // 每层高度 cm
}

export interface MannequinPose {
  id: ID;
  offsetX: number; offsetZ: number;  // 组内站位
  rotationY: number;
  pose: 'stand' | 'sit';
  hueTag?: string;
}

export type PlacedKind = 'material' | 'mannequinGroup' | 'kit' | 'panel';

export interface PlacedItem {
  id: ID;
  kind: PlacedKind;
  refId: ID;              // 物料 / 模特组 / 套件 id
  name: string;
  position: Vec3;         // 包围盒底面中心
  rotationY: number;
  scale: number;
  color?: RGB;
  locked?: boolean;
  wallMount?: boolean;    // 挂在背板槽位上
  isHero?: boolean;       // 主推款标记
  isAccessory?: boolean;  // 配饰标记
  hueTag?: string;
  flipY?: boolean;
  rail?: RailConfig;
  tower?: TowerConfig;
  mannequins?: MannequinPose[];
  panelPieces?: PanelPiece[];  // KT 背板分块
  kitItemRefs?: ID[];
}

export interface Material {
  id: ID;
  name: string;
  sku: string;
  category: MaterialCategory;
  surface: SurfaceType;
  size: Size3;
  weight: number;         // kg
  color: RGB;
  color2?: RGB;
  fold: FoldType;
  canStack: boolean;
  canFlip: boolean;
  wallSlot: boolean;
  isHero?: boolean;
  isAccessory?: boolean;
  hueTag?: string;
  remark?: string;
  updatedAt: number;
}

export interface MannequinGroup {
  id: ID;
  name: string;
  series: string;
  spacing: number;
  mannequins: MannequinPose[];
  updatedAt: number;
}

export interface Kit {
  id: ID;
  name: string;
  tags: string[];
  items: PlacedItem[];   // 相对坐标,放入方案时平移
  updatedAt: number;
}

export interface EnvSettings {
  locationType: LocationType;
  aisleWidth: number;        // 门前通道宽度 cm
  oppositeDistance: number;  // 对铺距离 cm
  fog: number;               // 玻璃起雾沾灰 0..1
  oppositeReflection: boolean; // 对面灯箱招牌反光
  lightboxPower: boolean;    // 灯箱通电/断电全局开关
}

export interface StoreWindow {
  id: ID;
  storeName: string;
  city: string;
  locationType: LocationType;
  width: number; depth: number; height: number;
  platformHeight: number;     // 地台高度
  door: { w: number; h: number };      // 门洞
  elevator: { w: number; h: number; d: number }; // 货梯
  aisleWidth: number;
  oppositeDistance: number;
  env: EnvSettings;
  updatedAt: number;
}

export interface ChangeEntry { at: number; desc: string; }

export interface Viewpoint {
  id: ID;
  name: string;
  eyeHeight: number;   // 成人 160 / 儿童 120
  position: Vec3;
  target: Vec3;
}

export interface Scheme {
  id: ID;
  name: string;
  brand: string;
  season: Season;
  slot: Slot;
  tags: string[];
  status: SchemeStatus;
  windowId: ID | null;
  items: PlacedItem[];
  env: EnvSettings;
  viewpoints: Viewpoint[];
  boundStoreIds: ID[];
  changeLog: ChangeEntry[];
  teachingTarget?: PlacedItem[]; // 教学模式隐藏目标阵
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // 回收站:删除时间,30 天可恢复
  confirmedAt?: number;
}

export type RuleLevel = 'error' | 'warning' | 'info';
export interface RuleIssue {
  level: RuleLevel;
  code: string;
  message: string;
  itemId?: ID;
}

export interface PackagingLine {
  materialId: ID;
  name: string;
  count: number;
  foldedSize: Size3;
  unitVolume: number;
  totalVolume: number;
  weight: number;
}
export interface PackagingResult {
  lines: PackagingLine[];
  totalVolume: number;     // cm³
  totalWeight: number;
  boxSpec: Size3;
  boxCount: number;
  laborHours: number;
}

export interface ConfirmDoc {
  id: ID;
  schemeId: ID;
  schemeName: string;
  brand: string;
  shots: { front: string; side: string; top: string };
  panelImage?: string;
  packaging: PackagingResult;
  issues: RuleIssue[];
  signedBy: string;
  signedAt: number;
  archived: boolean;
}

export interface AdaptConflict {
  windowId: ID;
  storeName: string;
  issues: RuleIssue[];
}

export interface DBShape {
  meta: { key: string; value: unknown };
  materials: Material;
  groups: MannequinGroup;
  kits: Kit;
  windows: StoreWindow;
  schemes: Scheme;
  docs: ConfirmDoc;
}
