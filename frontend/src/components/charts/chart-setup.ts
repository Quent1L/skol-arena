import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

/**
 * Chart.js with only what the app draws: line and bar charts on category/linear axes,
 * with filled areas, tooltips and legends. `chart.js/auto` registers every controller,
 * scale and plugin, about twice the size. A new chart type or plugin (time scale,
 * doughnut, title…) must be registered here or Chart.js throws on render.
 */
Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
)

export default Chart
