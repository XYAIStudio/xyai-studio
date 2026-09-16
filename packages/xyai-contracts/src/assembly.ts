/** 声明式装配图：启用哪些模块/Adapter/组件版本 */

export interface AssemblyHarness {
  id: string;
  adapter: string;
  enabled: boolean;
  version?: string;
  pinnedBinaryNote?: string;
}

export interface AssemblyModule {
  id: string;
  enabled: boolean;
  optional?: boolean;
  note?: string;
}

export interface AssemblyComponent {
  id: string;
  kind: 'submodule' | 'zip' | 'service';
  path?: string;
  required: boolean;
  note?: string;
}

export interface AssemblyProfile {
  productVersion: string;
  profileId: string;
  harnesses: AssemblyHarness[];
  modules: AssemblyModule[];
  components: AssemblyComponent[];
  notes?: string[];
}
