#include "include.h"
#include <string.h>

static bool fUartRxComplete = FALSE;
static uint8 UartRxBuffer[260];
uint8 Uart1RxBuffer[260];

static bool fTextLineComplete = FALSE;
static uint8 TextLineBuffer[64];
static uint8 TextLineLength = 0;
static uint8 TextRxBuffer[64];
static uint8 TextRxIndex = 0;

uint8 frameIndexSumSum[256];

static void Uart1SendText(const char *text);
static void Uart1SendU16(uint16 value);
static bool TextLineRxOK(char *line, uint8 max_len);
static void HandleTextCommand(char *line);
static bool ParseU16Token(const char *token, uint16 *out);
static bool TokenEqualsIgnoreCase(const char *lhs, const char *rhs);
static char *TrimLeft(char *s);
static void TrimRight(char *s);
static uint8 SplitCsv(char *line, char *tokens[], uint8 max_tokens);
static void Uart1TextRxFeed(uint8 ch);
static void Uart1TextRxReset(void);

void InitUart1(void)
{
    NVIC_InitTypeDef NVIC_InitStructure;
    GPIO_InitTypeDef GPIO_InitStructure;
    USART_InitTypeDef USART_InitStructure;

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1 | RCC_APB2Periph_GPIOA | RCC_APB2Periph_AFIO, ENABLE);

    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_9;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_10;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    USART_InitStructure.USART_BaudRate = 9600;
    USART_InitStructure.USART_WordLength = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits = USART_StopBits_1;
    USART_InitStructure.USART_Parity = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;

    USART_Init(USART1, &USART_InitStructure);
    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);
    USART_Cmd(USART1, ENABLE);

    NVIC_InitStructure.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 0;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}

void Uart1SendData(BYTE dat)
{
    while((USART1->SR & 0X40) == 0)
    {
    }
    USART1->DR = (u8)dat;
    while((USART1->SR & 0X40) == 0)
    {
    }
}

void UART1SendDataPacket(uint8 dat[], uint8 count)
{
    uint32 i;
    for(i = 0; i < count; i++)
    {
        while((USART1->SR & 0X40) == 0)
        {
        }
        USART1->DR = dat[i];
        while((USART1->SR & 0X40) == 0)
        {
        }
    }
}

static void Uart1SendText(const char *text)
{
    while(*text != '\0')
    {
        Uart1SendData((BYTE)*text);
        text++;
    }
}

static void Uart1SendU16(uint16 value)
{
    char buf[5];
    uint8 i = 0;
    uint8 j;

    if(value == 0)
    {
        Uart1SendData('0');
        return;
    }

    while(value > 0 && i < (uint8)sizeof(buf))
    {
        buf[i++] = (char)('0' + (value % 10));
        value /= 10;
    }

    for(j = 0; j < i; j++)
    {
        Uart1SendData((BYTE)buf[i - 1 - j]);
    }
}

static void Uart1TextRxReset(void)
{
    TextRxIndex = 0;
}

static void Uart1TextRxFeed(uint8 ch)
{
    if(ch == '\r' || ch == '\n')
    {
        if(TextRxIndex > 0 && !fTextLineComplete)
        {
            uint8 i;
            for(i = 0; i < TextRxIndex; i++)
            {
                TextLineBuffer[i] = TextRxBuffer[i];
            }
            TextLineBuffer[TextRxIndex] = '\0';
            TextLineLength = TextRxIndex;
            fTextLineComplete = TRUE;
        }
        TextRxIndex = 0;
        return;
    }

    if((
        (ch >= '0' && ch <= '9') ||
        (ch >= 'A' && ch <= 'Z') ||
        (ch >= 'a' && ch <= 'z') ||
        ch == ',' || ch == '_' || ch == '-' || ch == ' ' || ch == '\t') &&
        (TextRxIndex < (uint8)(sizeof(TextRxBuffer) - 1U)))
    {
        TextRxBuffer[TextRxIndex++] = ch;
    }
    else
    {
        Uart1TextRxReset();
    }
}

void USART1_IRQHandler(void)
{
    uint8 i;
    uint8 rxBuf;

    static uint8 startCodeSum = 0;
    static bool fFrameStart = FALSE;
    static uint8 messageLength = 0;
    static uint8 messageLengthSum = 2;

    if(USART_GetITStatus(USART1, USART_IT_RXNE) != RESET)
    {
        rxBuf = (uint8)USART_ReceiveData(USART1);

        if(!fFrameStart)
        {
            if(rxBuf == 0x55)
            {
                startCodeSum++;
                if(startCodeSum == 2)
                {
                    startCodeSum = 0;
                    fFrameStart = TRUE;
                    messageLength = 1;
                    Uart1TextRxReset();
                }
            }
            else
            {
                startCodeSum = 0;
                Uart1TextRxFeed(rxBuf);
            }
        }

        if(fFrameStart)
        {
            Uart1RxBuffer[messageLength] = rxBuf;

            if(messageLength == 2)
            {
                messageLengthSum = Uart1RxBuffer[messageLength];
                if(messageLengthSum < 2)
                {
                    messageLengthSum = 2;
                    fFrameStart = FALSE;
                    messageLength = 0;
                }
            }

            messageLength++;

            if(messageLength == (uint8)(messageLengthSum + 2))
            {
                if(!fUartRxComplete)
                {
                    fUartRxComplete = TRUE;
                    for(i = 0; i < messageLength; i++)
                    {
                        UartRxBuffer[i] = Uart1RxBuffer[i];
                    }
                }

                fFrameStart = FALSE;
                messageLength = 0;
                startCodeSum = 0;
            }
        }
    }
}

void McuToPCSendData(uint8 cmd, uint8 prm1, uint8 prm2)
{
    uint8 dat[8];
    uint8 datlLen = 2;

    dat[0] = 0x55;
    dat[1] = 0x55;
    dat[2] = datlLen;
    dat[3] = cmd;
    dat[4] = prm1;
    dat[5] = prm2;
    UART1SendDataPacket(dat, datlLen + 2);
}

static bool UartRxOK(void)
{
    if(fUartRxComplete)
    {
        fUartRxComplete = FALSE;
        return TRUE;
    }
    else
    {
        return FALSE;
    }
}

static bool TextLineRxOK(char *line, uint8 max_len)
{
    uint8 i;
    uint8 copy_len;

    if(!fTextLineComplete)
    {
        return FALSE;
    }

    copy_len = TextLineLength;
    if(copy_len >= max_len)
    {
        copy_len = (uint8)(max_len - 1U);
    }

    for(i = 0; i < copy_len; i++)
    {
        line[i] = (char)TextLineBuffer[i];
    }
    line[copy_len] = '\0';

    fTextLineComplete = FALSE;
    TextLineLength = 0;
    return TRUE;
}

static bool ParseU16Token(const char *token, uint16 *out)
{
    uint32 value = 0;

    if(token == 0 || out == 0 || *token == '\0')
    {
        return FALSE;
    }

    while(*token != '\0')
    {
        if(*token < '0' || *token > '9')
        {
            return FALSE;
        }

        value = value * 10U + (uint32)(*token - '0');
        if(value > 65535UL)
        {
            return FALSE;
        }
        token++;
    }

    *out = (uint16)value;
    return TRUE;
}

static bool TokenEqualsIgnoreCase(const char *lhs, const char *rhs)
{
    char a;
    char b;

    if(lhs == 0 || rhs == 0)
    {
        return FALSE;
    }

    while(*lhs != '\0' && *rhs != '\0')
    {
        a = *lhs;
        b = *rhs;
        if(a >= 'a' && a <= 'z')
        {
            a = (char)(a - 'a' + 'A');
        }
        if(b >= 'a' && b <= 'z')
        {
            b = (char)(b - 'a' + 'A');
        }
        if(a != b)
        {
            return FALSE;
        }
        lhs++;
        rhs++;
    }

    return (*lhs == '\0' && *rhs == '\0') ? TRUE : FALSE;
}

static char *TrimLeft(char *s)
{
    while(*s == ' ' || *s == '\t')
    {
        s++;
    }
    return s;
}

static void TrimRight(char *s)
{
    uint16 len;

    if(s == 0)
    {
        return;
    }

    len = (uint16)strlen(s);
    while(len > 0)
    {
        char ch = s[len - 1];
        if(ch == ' ' || ch == '\t')
        {
            s[len - 1] = '\0';
            len--;
        }
        else
        {
            break;
        }
    }
}

static uint8 SplitCsv(char *line, char *tokens[], uint8 max_tokens)
{
    uint8 count = 0;
    char *p;

    if(line == 0 || tokens == 0 || max_tokens == 0)
    {
        return 0;
    }

    tokens[count++] = line;
    for(p = line; *p != '\0' && count < max_tokens; p++)
    {
        if(*p == ',')
        {
            *p = '\0';
            tokens[count++] = p + 1;
        }
    }

    return count;
}

static void HandleTextCommand(char *line)
{
    char *tokens[5];
    uint8 token_count;
    uint8 i;
    uint16 id = 0;
    uint16 pos = 0;
    uint16 time = 0;
    uint16 vin = 0;
    uint8 temp = 0;
    uint8 read_id = 0;
    int16 read_pos = 0;
    char *cmd;

    token_count = SplitCsv(line, tokens, 5);
    if(token_count == 0)
    {
        return;
    }

    for(i = 0; i < token_count; i++)
    {
        tokens[i] = TrimLeft(tokens[i]);
        TrimRight(tokens[i]);
    }

    cmd = tokens[0];

    if(TokenEqualsIgnoreCase(cmd, "PING"))
    {
        Uart1SendText("OK\n");
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "HELP"))
    {
        Uart1SendText("OK,CMDS=M,Q,V,T,I,PING\n");
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "M"))
    {
        if(token_count != 4 ||
           !ParseU16Token(tokens[1], &id) ||
           !ParseU16Token(tokens[2], &pos) ||
           !ParseU16Token(tokens[3], &time))
        {
            Uart1SendText("ERR,ARG\n");
            return;
        }

        if(id == 0 || id > 253 || pos > 1000 || time == 0 || time > 30000)
        {
            Uart1SendText("ERR,RANGE\n");
            return;
        }

        ServoSetPluseAndTime((uint8)id, pos, time);
        (void)BusServoMove((uint8)id, pos, time);
        Uart1SendText("OK\n");
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "Q"))
    {
        if(token_count != 2 || !ParseU16Token(tokens[1], &id) || id == 0 || id > 253)
        {
            Uart1SendText("ERR,ARG\n");
            return;
        }

        if(!BusServoReadPosition((uint8)id, &read_pos))
        {
            Uart1SendText("ERR,NO_POS\n");
            return;
        }

        if(read_pos < 0)
        {
            read_pos = 0;
        }

        Uart1SendText("P,");
        Uart1SendU16(id);
        Uart1SendData(',');
        Uart1SendU16((uint16)read_pos);
        Uart1SendData('\n');
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "V"))
    {
        if(token_count != 2 || !ParseU16Token(tokens[1], &id) || id == 0 || id > 253)
        {
            Uart1SendText("ERR,ARG\n");
            return;
        }

        if(!BusServoReadVin((uint8)id, &vin))
        {
            Uart1SendText("ERR,NO_VIN\n");
            return;
        }

        Uart1SendText("V,");
        Uart1SendU16(id);
        Uart1SendData(',');
        Uart1SendU16(vin);
        Uart1SendData('\n');
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "T"))
    {
        if(token_count != 2 || !ParseU16Token(tokens[1], &id) || id == 0 || id > 253)
        {
            Uart1SendText("ERR,ARG\n");
            return;
        }

        if(!BusServoReadTemp((uint8)id, &temp))
        {
            Uart1SendText("ERR,NO_TEMP\n");
            return;
        }

        Uart1SendText("T,");
        Uart1SendU16(id);
        Uart1SendData(',');
        Uart1SendU16((uint16)temp);
        Uart1SendData('\n');
        return;
    }

    if(TokenEqualsIgnoreCase(cmd, "I"))
    {
        if(token_count != 2 || !ParseU16Token(tokens[1], &id) || id == 0 || id > 253)
        {
            Uart1SendText("ERR,ARG\n");
            return;
        }

        if(!BusServoReadID((uint8)id, &read_id))
        {
            Uart1SendText("ERR,NO_ID\n");
            return;
        }

        Uart1SendText("I,");
        Uart1SendU16(id);
        Uart1SendData(',');
        Uart1SendU16((uint16)read_id);
        Uart1SendData('\n');
        return;
    }

    Uart1SendText("ERR,CMD\n");
}

void FlashEraseAll(void);
void SaveAct(uint8 fullActNum, uint8 frameIndexSum, uint8 frameIndex, uint8* pBuffer);

void TaskPCMsgHandle(void)
{
    uint16 i;
    uint8 cmd;
    uint8 id;
    uint8 servoCount;
    uint16 time;
    uint16 pos;
    uint16 times;
    uint8 fullActNum;
    char textLine[64];

    if(TextLineRxOK(textLine, (uint8)sizeof(textLine)))
    {
        LED = !LED;
        HandleTextCommand(textLine);
    }

    if(UartRxOK())
    {
        LED = !LED;
        cmd = UartRxBuffer[3];
        switch(cmd)
        {
            case CMD_MULT_SERVO_MOVE:
                servoCount = UartRxBuffer[4];
                time = UartRxBuffer[5] + (UartRxBuffer[6] << 8);
                for(i = 0; i < servoCount; i++)
                {
                    id = UartRxBuffer[7 + i * 3];
                    pos = UartRxBuffer[8 + i * 3] + (UartRxBuffer[9 + i * 3] << 8);

                    ServoSetPluseAndTime(id, pos, time);
                    BusServoCtrl(id, SERVO_MOVE_TIME_WRITE, pos, time);
                }
                break;

            case CMD_FULL_ACTION_RUN:
                fullActNum = UartRxBuffer[4];
                times = UartRxBuffer[5] + (UartRxBuffer[6] << 8);
                McuToPCSendData(CMD_FULL_ACTION_RUN, 0, 0);
                FullActRun(fullActNum, times);
                break;

            case CMD_FULL_ACTION_STOP:
                FullActStop();
                break;

            case CMD_FULL_ACTION_ERASE:
                FlashEraseAll();
                McuToPCSendData(CMD_FULL_ACTION_ERASE, 0, 0);
                break;

            case CMD_ACTION_DOWNLOAD:
                SaveAct(UartRxBuffer[4], UartRxBuffer[5], UartRxBuffer[6], UartRxBuffer + 7);
                McuToPCSendData(CMD_ACTION_DOWNLOAD, 0, 0);
                break;

            default:
                break;
        }
    }
}

void SaveAct(uint8 fullActNum, uint8 frameIndexSum, uint8 frameIndex, uint8* pBuffer)
{
    uint8 i;

    if(frameIndex == 0)
    {
        for(i = 0; i < 4; i++)
        {
            FlashEraseSector((MEM_ACT_FULL_BASE) + (fullActNum * ACT_FULL_SIZE) + (i * 4096));
        }
    }

    FlashWrite((MEM_ACT_FULL_BASE) + (fullActNum * ACT_FULL_SIZE) + (frameIndex * ACT_SUB_FRAME_SIZE),
               ACT_SUB_FRAME_SIZE,
               pBuffer);

    if((frameIndex + 1) == frameIndexSum)
    {
        FlashRead(MEM_FRAME_INDEX_SUM_BASE, 256, frameIndexSumSum);
        frameIndexSumSum[fullActNum] = frameIndexSum;
        FlashEraseSector(MEM_FRAME_INDEX_SUM_BASE);
        FlashWrite(MEM_FRAME_INDEX_SUM_BASE, 256, frameIndexSumSum);
    }
}

void FlashEraseAll(void)
{
    uint16 i;

    for(i = 0; i <= 255; i++)
    {
        frameIndexSumSum[i] = 0;
    }
    FlashEraseSector(MEM_FRAME_INDEX_SUM_BASE);
    FlashWrite(MEM_FRAME_INDEX_SUM_BASE, 256, frameIndexSumSum);
}

void InitMemory(void)
{
    uint8 i;
    uint8 logo[] = "LOBOT";
    uint8 datatemp[8];

    FlashRead(MEM_LOBOT_LOGO_BASE, 5, datatemp);
    for(i = 0; i < 5; i++)
    {
        if(logo[i] != datatemp[i])
        {
            LED = LED_ON;
            FlashEraseSector(MEM_LOBOT_LOGO_BASE);
            FlashWrite(MEM_LOBOT_LOGO_BASE, 5, logo);
            FlashEraseAll();
            break;
        }
    }
}
