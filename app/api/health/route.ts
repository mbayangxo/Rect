import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .limit(1)
  
  if (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 })
  }
  
  return NextResponse.json({ 
    status: 'ok',
    service: 'RECT API',
    supabase: 'connected',
    test: data
  })
}
