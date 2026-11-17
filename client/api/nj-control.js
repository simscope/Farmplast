/* global process */
import {createNjControlHandler} from '../server/njControlProxy.mjs'
export const config={api:{bodyParser:false}}
export const maxDuration=30
export default createNjControlHandler(process.env)
