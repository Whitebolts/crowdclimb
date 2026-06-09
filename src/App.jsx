import { Routes, Route, Link } from 'react-router-dom'
import HostPage from './pages/HostPage'
import JoinPage from './pages/JoinPage'
import PlayerPage from './pages/PlayerPage'

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/play/:roomCode" element={<PlayerPage />} />
    </Routes>
  )
}
