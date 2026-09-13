import { clientBundle } from '../../packages/client/tsdown.client.ts'

/** XYAI is outside the Host tsc aggregate, so the Node half bundles from `src`. */
export default clientBundle('@xyai/dsh-composer', ['src/index.ts'])
