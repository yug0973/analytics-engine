// client/src/components/layout/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Sidebar.module.css'

const links = [
  { to: '/',       label: 'Dashboard', icon: '▦' },
  { to: '/alerts', label: 'Alerts',    icon: '⚠' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.dot} />
        Analytics
      </div>

      <nav className={styles.nav}>
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.icon}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <p className={styles.email}>{user?.email}</p>
        <button onClick={logout} className={styles.logout}>Sign out</button>
      </div>
    </aside>
  )
}
