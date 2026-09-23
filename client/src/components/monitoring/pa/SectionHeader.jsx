import { Link } from 'react-router-dom'
// Supply to only when its detail route exists.
export default function SectionHeader({ id, title, description, to }) {
  return <header className="pa-section-header"><div><h2 id={id}>{title}</h2><p className="pa-muted">{description}</p></div>{to && <Link className="pa-home" to={to}>View details →</Link>}</header>
}
