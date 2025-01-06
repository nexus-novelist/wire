import { useTheme } from '@nextui-org/use-theme'

import Wire from './pages/wire'

import { Card, CardHeader, CardBody, Divider } from '@nextui-org/react'

function App() {
  const { theme } = useTheme()

  return (
    <div
      className={`${theme} text-foreground bg-background h-screen flex items-center justify-center`}
    >
      <Card className="w-[90%]">
        <CardHeader>
          <h1 className="text-2xl font-bold">Wire</h1>
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
