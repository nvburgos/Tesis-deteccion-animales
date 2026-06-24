'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'

type UserRole = 'Admin' | 'Investigador'

type ManagedUser = {
  id: number
  createdAt: string
  email: string
  institution: string | null
  name: string
  role: UserRole
}

type UsersResponse = {
  currentUser: {
    id: number
    role: string
  }
  roles: UserRole[]
  users: ManagedUser[]
}

async function fetchUsers() {
  const response = await fetch('/api/users', { cache: 'no-store' })
  const data = (await response.json().catch(() => null)) as Partial<UsersResponse> & { error?: string } | null

  if (!response.ok) {
    throw new Error(data?.error ?? 'No se pudieron cargar los usuarios')
  }

  return data as UsersResponse
}

async function updateUserRole(userId: number, role: UserRole) {
  const response = await fetch('/api/users', {
    body: JSON.stringify({ role, userId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH'
  })
  const data = (await response.json().catch(() => null)) as { error?: string; user?: ManagedUser } | null

  if (!response.ok || !data?.user) {
    throw new Error(data?.error ?? 'No se pudo actualizar el rol')
  }

  return data.user
}

export default function UsuariosPage() {
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<UserRole[]>(['Admin', 'Investigador'])
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [success, setSuccess] = useState('')
  const [users, setUsers] = useState<ManagedUser[]>([])

  useEffect(() => {
    fetchUsers()
      .then((data) => {
        setCurrentUserId(data.currentUser.id)
        setRoles(data.roles)
        setUsers(data.users)
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando usuarios')
      })
  }, [])

  async function handleRoleChange(userId: number, role: UserRole) {
    setError('')
    setSuccess('')
    setSavingUserId(userId)

    try {
      const updatedUser = await updateUserRole(userId, role)

      setUsers((currentUsers) => currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)))
      setSuccess('Rol actualizado correctamente')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar el rol')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header
          title="Usuarios"
          subtitle="Administra las cuentas de investigadores y permisos de acceso"
        />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}
          {success ? <div className="statusBanner successBanner">{success}</div> : null}

          <section className="detectionsPanel" aria-label="Usuarios registrados">
            <div className="panelHeader">
              <h2>Cuentas registradas</h2>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Institucion</th>
                    <th>Rol</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <span className="tableSubtext">
                            {user.email}
                            {user.id === currentUserId ? ' | Tu cuenta' : ''}
                          </span>
                        </td>
                        <td>{user.institution ?? 'Sin institucion'}</td>
                        <td>
                          <select
                            className="roleSelect"
                            disabled={savingUserId === user.id}
                            onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                            value={user.role}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <time dateTime={user.createdAt}>
                            {new Date(user.createdAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
                          </time>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="emptyState" colSpan={4}>
                        No hay usuarios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
