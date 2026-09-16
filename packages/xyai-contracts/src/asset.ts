/** 知识库/文件挂接元数据与溯源引用 */

export interface AssetRef {
  id: string;
  kind: 'file' | 'directory' | 'kb-mount' | 'xyos-asset';
  uri: string;
  displayName: string;
  provenance?: string;
}

export interface AssetIndex {
  list(): Promise<AssetRef[]>;
  resolve(id: string): Promise<AssetRef | undefined>;
}
