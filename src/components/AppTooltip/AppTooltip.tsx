import { Tooltip } from 'antd';
import type { TooltipProps } from 'antd';

export const AppTooltip = ({
  mouseEnterDelay = 0.2,
  mouseLeaveDelay = 0.1,
  placement = 'top',
  destroyTooltipOnHide = true,
  ...props
}: TooltipProps) => (
  <Tooltip
    mouseEnterDelay={mouseEnterDelay}
    mouseLeaveDelay={mouseLeaveDelay}
    placement={placement}
    destroyTooltipOnHide={destroyTooltipOnHide}
    {...props}
  />
);
