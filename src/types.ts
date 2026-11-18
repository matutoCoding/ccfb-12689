// ============================================================
// 领域模型：全部尺寸单位为毫米(mm)，角度为度(deg)
// ============================================================

export type ID = string;

/** 道具材质大类 */
export type MaterialCategory = 'acrylic' | 'wood' | 'kt' | 'lightbox' | 'chrome' | 'velvet' | 'fabric';
/** 店外站位环境 */
export type StoreEnvironment = 'mall' | 'street' | 'atrium';
/** 方案状态 */
export type PlanStatus = 'draft' | 'confirmed';
/** 陈列元素类型 */
export type ItemType = 'prop' | 'mannequin' | 'rail' | 'foldTower';
/** 道具折叠/拆装方式 */
export type PackMethod = 'integral' | 'foldable' | 'detachable' | 'flat';

export interface Vec3 { x: number; y: number; z: number; }

/** 材质渲染参数（驱动 WebGL2 shader） */
export interface MaterialDef {
  category: MaterialCategory;
  color: [number, number, number];      // 线性 0..1
  roughness: number;                    // 0..1
  /** 亚克力透明度 0..1（1=不透明）；灯箱发光度复用此字段语义 */
  opacity?: number;
  /** 程序化纹理参数 */
  texture?: {
    woodGrain?: boolean;
    ktGrain?: number;                   // 覆膜亚光颗粒强度
    velvet?: boolean;
    fabric?: boolean;
  };
  /** 灯箱通电/断电颜色（断电自动发灰） */
  lightbox?: { onColor: [number, number, number]; power: number };
}

/** 道具（物料库条目） */
export interface Prop {
  id: ID;
  name: string;
  category: MaterialCategory;
  /** 包围盒尺寸（真实尺寸） */
  size: { w: number; h: number; d: number };
  /** 体量分级 1..5，用于包装与配重提示 */
  volume: number;
  material: MaterialDef;
  packMethod: PackMethod;
  /** 包装后单箱尺寸（扁平件为打包厚度） */
  packSize: { w: number; h: number; d: number };
  /** 单件包装重量 kg */
  weight: number;
  /** 是否可挂背板槽位 */
  slotMountable: boolean;
  tags: string[];
  createdAt: number;
  archived?: boolean;
}

/** 自定义陈列套件（可复用组合） */
export interface PropKit {
  id: ID;
  name: string;
  tags: string[];
  /** 套件内元素定义（位置相对套件原点） */
  items: Omit<LayoutItem, 'id'>[];
  createdAt: number;
}

/** 门店橱窗档案 */
export interface WindowProfile {
  id: ID;
  storeCode: string;
  storeName: string;
  city: string;
  environment: StoreEnvironment;
  /** 开间 */
  width: number;
  /** 进深 */
  depth: number;
  /** 净高 */
  height: number;
  /** 地台高度 */
  platformHeight: number;
  /** 门洞尺寸 */
  door: { w: number; h: number };
  /** 货梯尺寸 */
  elevator: { w: number; h: number; d: number };
  /** 门前通道宽度 */
  walkwayWidth: number;
  /** 对铺距离 */
  oppositeDistance: number;
  /** 背板槽位：高度数组（距地台） */
  slotHeights: number[];
  tags: string[];
  createdAt: number;
  archived?: boolean;
}

/** 模特系列 */
export interface MannequinSeries {
  id: ID;
  name: string;
  /** 系列色（用于同色系占位判定） */
  colorTag: string;
  /** 系列代表色（hex，驱动渲染与取色器） */
  color: string;
  count: number;
  /** 标准站位间距 */
  spacing: number;
  createdAt: number;
}

export type ItemFlag = 'main' | 'accessory' | 'locked';

/** 方案中的陈列元素 */
export interface LayoutItem {
  id: ID;
  type: ItemType;
  refId: ID;                 // prop.id / mannequinSeries.id
  name: string;
  x: number;                 // 中心点 X（橱窗中心为 0）
  z: number;                 // 中心点 Z（玻璃面 z = depth/2）
  rotation: number;          // 绕 Y 角度
  flipped: boolean;
  flags: ItemFlag[];
  // 类型专属
  /** 横杆：件间距与已挂件数 */
  rail?: { spacing: number; garmentCount: number; garmentColor: string };
  /** 叠装塔：层数与层高 */
  tower?: { layers: number; layerHeight: number };
  /** KT 背板分块覆盖（引擎/裁切计算回填） */
  panel?: { cols: number; rows: number };
  /** 挂背板槽位高度（0 表示落地） */
  slotY?: number;
  /** 模特系列实例数量与朝向 */
  mannequins?: { facing: number };
}

/** 行人视点（机位书签） */
export interface Viewpoint {
  id: ID;
  name: string;
  /** 成人/儿童眼高 */
  eyeHeight: number;
  /** 站位：通道中的 x 坐标与距离玻璃的距离 */
  x: number;
  distance: number;
  /** 相机观察目标点 */
  target: { x: number; y: number; z: number };
}

/** 店外环境预览设置 */
export interface EnvSettings {
  fogLevel: number;          // 玻璃起雾/沾灰发花程度 0..1
  reflectionOn: boolean;     // 对面灯箱招牌反光
  lightboxPowerOn: boolean;  // 灯箱通电/断电
  ambient: number;           // 环境光强度
}

/** 方案 */
export interface DisplayPlan {
  id: ID;
  name: string;
  brand: string;
  season: string;            // 春/夏/秋/冬
  festival: string;          // 档期：开业/情人节/618/双11/春节/常规…
  tags: string[];
  windowProfileId: ID;
  items: LayoutItem[];
  viewpoints: Viewpoint[];
  env: EnvSettings;
  status: PlanStatus;
  templateId?: ID;
  /** 主题联动：作为主题被门店挂接 */
  isTheme?: boolean;
  /** 挂接的主题方案 id（门店副本） */
  themeSourceId?: ID;
  /** 主题挂接的门店橱窗 id 列表（主题正本上记录） */
  linkedStoreIds?: ID[];
  /** 改动记录 */
  changeLog: { at: number; text: string }[];
  createdAt: number;
  updatedAt: number;
  /** 回收站 */
  deletedAt?: number;
  confirmedAt?: number;
  version: number;
}

/** 规则检查提示 */
export interface RuleIssue {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  itemId?: ID;
}

/** 碰撞/超限检测结果 */
export interface CollisionResult {
  itemId: ID;
  type: 'overlap' | 'doorExceed' | 'elevatorExceed' | 'outOfBounds';
  message: string;
  withItemId?: ID;
}

/** KT 板裁切分块 */
export interface PanelSlice {
  index: number;             // 编号 KT-01…
  col: number;
  row: number;
  w: number;
  h: number;
  x: number;                 // 在背板坐标系的左下角
  y: number;
}

/** 包装汇总条目 */
export interface PackageEntry {
  propId: ID;
  name: string;
  count: number;
  packMethod: PackMethod;
  perBox: number;            // 每箱可装件数
  boxes: number;
  volume: number;            // 总体积 m³
  weight: number;            // 总重量 kg
}

/** 方案确认书 */
export interface ConfirmationDoc {
  id: ID;
  planId: ID;
  planName: string;
  brand: string;
  storeName: string;
  generatedAt: number;
  totalVolume: number;
  totalBoxes: number;
  totalWeight: number;
  installHours: number;
  packages: PackageEntry[];
  panels: PanelSlice[];
  /** 三张效果图（dataURL） */
  shots: { front: string; side: string; top: string };
  signature?: string;
  signedAt?: number;
}

/** 模板元素：归一化坐标 0..1，套用按橱窗尺寸反归一化 */
export type TemplateItem = Omit<LayoutItem, 'id' | 'x' | 'z'> & { nx: number; nz: number };

/** 陈列模板 */
export interface DisplayTemplate {
  id: ID;
  name: string;
  style: 'minimal' | 'festive' | 'luxury';
  description: string;
  items: TemplateItem[];
}

/** 教学模式评分 */
export interface TeachingScore {
  total: number;
  focus: number;
  colorRhythm: number;
  density: number;
  comments: string[];
}

/** 批量适配结果条目 */
export interface BatchAdaptResult {
  profileId: ID;
  storeName: string;
  ok: boolean;
  issues: RuleIssue[];
  collisions: CollisionResult[];
}
