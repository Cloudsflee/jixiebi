#include "include.h"

#define BUS_SERVO_SMOKE_TEST 0

int main(void)
{
	uint8 id;
	SystemInit();			 //系统时钟初始化为72M	  SYSCLK_FREQ_72MHz
	InitDelay(72);	     //延时初始化
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);	//设置NVIC中断分组2:2位抢占优先级，2位响应优先级
	InitPWM();
	InitTimer2();//用于产生100us的定时中断
	InitUart1();//用于与PC端进行通信
	InitUart3();//外接模块的串口
	InitADC();
	InitLED();
	InitKey();
	InitBuzzer();
	InitPS2();//PS2游戏手柄接收器初始化
	InitFlash();
	InitMemory();
	InitBusServoCtrl();
	LED = LED_ON;

	/* Ensure all expected bus-servo IDs are load-enabled at startup. */
	for(id = 1; id <= 6; id++)
	{
		BusServoLoadOrUnload(id, 1);
	}

#if BUS_SERVO_SMOKE_TEST
	while(1)
	{
		BusServoMove(1, 1000, 1000);
		DelayMs(1500);
		BusServoMove(1, 0, 1000);
		DelayMs(1500);
	}
#else
	BusServoCtrl(1,SERVO_MOVE_TIME_WRITE,500,1000);
	BusServoCtrl(2,SERVO_MOVE_TIME_WRITE,500,1000);
	BusServoCtrl(3,SERVO_MOVE_TIME_WRITE,500,1000);
	BusServoCtrl(4,SERVO_MOVE_TIME_WRITE,500,1000);

	while(1)
	{
		TaskRun();
	}
#endif
}
