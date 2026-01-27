# Solución al error "Branch has no history in common with trunk"

Este error aparece cuando tu rama actual no comparte historial con la rama base (por ejemplo, `trunk`). Para evitarlo, asegúrate de que tu rama derive de `trunk` o que `trunk` exista en el repositorio remoto.

## Pasos recomendados

1. **Trae la rama `trunk` del remoto** (si existe):
   ```bash
   git fetch origin trunk
   ```

2. **Si `trunk` no existe aún**, créala desde el commit actual y publícala:
   ```bash
   git branch trunk
   git push -u origin trunk
   ```

3. **Asegura que tu rama actual derive de `trunk`**:
   ```bash
   git checkout work
   git rebase origin/trunk
   ```

4. **Actualiza tu rama remota**:
   ```bash
   git push -u origin work --force-with-lease
   ```

## Resultado esperado

Después de estos pasos, tu rama `work` compartirá historial con `trunk` y podrás crear la solicitud de extracción sin el error.
