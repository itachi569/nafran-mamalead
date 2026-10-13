import type { ReactElement } from 'react'
import { ReferenceApp } from './app/ReferenceApp'
import { useAppValues } from './app/useAppValues'

// The renderer is the reference document itself: ReferenceApp is generated from the reference
// markup and driven by useAppValues, which reproduces the reference logic and routes the Maps
// run through the Chromium worker.
export default function App(): ReactElement {
  const values = useAppValues()
  return <ReferenceApp V={values} />
}
