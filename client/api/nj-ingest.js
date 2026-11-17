/* global process */
import {createNjDeviceHandler} from '../server/njDeviceProxy.mjs'
export const config={api:{bodyParser:{sizeLimit:'32kb'}}}
export const maxDuration=30
export default createNjDeviceHandler(process.env)
