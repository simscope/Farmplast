import {useCallback,useEffect,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {startOtaStatusPolling} from '../utils/otaStatusPolling'

export default function useOtaStatus(device) {
  const [data,setData]=useState(null),[error,setError]=useState('')
  const session=useRef(null)
  useEffect(()=>{
    const polling=startOtaStatusPolling(async signal=>{
      const result=await supabase.functions.invoke('chiller-ota',{body:{op:'status',device},signal,timeout:10000})
      if(signal.aborted) throw new Error('Aborted')
      if(result.error || result.data?.error) {
        setError(result.data?.error || 'Programming service unavailable or access denied.')
        throw new Error('Status unavailable')
      }
      setData(result.data);setError('');return result.data
    },document)
    session.current=polling
    return ()=>{polling.stop();session.current=null}
  },[device])
  const refresh=useCallback((queued=false)=>session.current?.refresh(queued),[])
  return {data,error,refresh}
}
