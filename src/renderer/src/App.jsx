import { useTheme } from '@nextui-org/use-theme'
import { Card, CardHeader, CardBody, Divider } from '@nextui-org/react'

import Wire from './pages/wire'

function App() {
  const { theme } = useTheme()

  return (
    <div
      className={`${theme} text-foreground bg-background h-screen flex items-center justify-center`}
    >
      <Card className="w-[90%]">
        <CardHeader>
          <h1 className="text-7xl font-bold italic text-center w-full select-none">Wire</h1>
        </CardHeader>
        <Divider />
        <CardBody>
          <Wire />
        </CardBody>
      </Card>
    </div>
  )
}

export default App
