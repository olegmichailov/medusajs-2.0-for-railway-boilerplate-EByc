"use client"
import React from "react"

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, {hasError:boolean}> {
  constructor(p:any){ super(p); this.state={hasError:false} }
  static getDerivedStateFromError(){ return { hasError:true } }
  componentDidCatch(err:any, info:any){ console.error("Darkroom error:", err, info) }
  render(){
    if (this.state.hasError) {
      return (
        <div className="w-full h-[60vh] grid place-items-center">
          <div className="text-sm text-black/70">
            Something went wrong. <button className="underline" onClick={()=>location.reload()}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
