import { useState, useRef } from 'react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

/**
 * Hook que reemplaza window.confirm() con un diálogo estilizado.
 *
 * Uso:
 *   const { confirmDialog, ConfirmDialogNode } = useConfirm()
 *
 *   // En el JSX devuelve ConfirmDialogNode junto al resto del contenido
 *   // En handlers:
 *   const ok = await confirmDialog('¿Seguro?')
 *   if (!ok) return
 */
export function useConfirm() {
  const [state, setState] = useState({ open: false, message: '', title: '', destructive: false })
  const resolveRef = useRef(null)

  const confirmDialog = (message, { title = 'Confirmar acción', destructive = false } = {}) =>
    new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, message, title, destructive })
    })

  const handleConfirm = () => {
    resolveRef.current?.(true)
    setState(s => ({ ...s, open: false }))
  }

  const handleCancel = () => {
    resolveRef.current?.(false)
    setState(s => ({ ...s, open: false }))
  }

  const ConfirmDialogNode = (
    <AlertDialog open={state.open}>
      <AlertDialogContent style={{ borderRadius: '12px' }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.message && (
            <AlertDialogDescription>{state.message}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={state.destructive ? 'bg-[#E24B4A] hover:bg-[#E24B4A]/90 text-white' : ''}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirmDialog, ConfirmDialogNode }
}
