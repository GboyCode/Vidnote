import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { Download } from 'lucide-react';

interface Node {
  id: string;
  text: string;
  x: number;
  y: number;
  level: number;
  parentId?: string;
  children: string[];
  color: string;
}

interface MindMapProps {
  data: string;
  className?: string;
}

const MindMap: React.FC<MindMapProps> = ({ data, className }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Record<string, Node>>({});
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 清理文本中的格式符号
  const cleanText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记 **text**
      .replace(/\*(.*?)\*/g, '$1')     // 移除斜体标记 *text*
      .replace(/`(.*?)`/g, '$1')      // 移除代码标记 `text`
      .replace(/#{1,6}\s/g, '')       // 移除标题标记 # ## ###
      .replace(/^[-*+]\s/gm, '')      // 移除列表标记 - * +
      .replace(/^\d+\.\s/gm, '')      // 移除数字列表标记 1. 2.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接格式 [text](url)
      .replace(/^>\s/gm, '')          // 移除引用标记 >
      .replace(/\n{3,}/g, '\n\n')     // 合并多个换行为两个
      .trim();
  };

  // 彩虹色系配置
  const colors = [
    '#FF6B6B', // 珊瑚红
    '#4ECDC4', // 青绿色
    '#45B7D1', // 天蓝色
    '#96CEB4', // 薄荷绿
    '#FFEAA7', // 柠檬黄
    '#DDA0DD', // 梅花紫
    '#98D8C8', // 薄荷蓝
    '#F7DC6F', // 金黄色
    '#BB8FCE', // 淡紫色
    '#85C1E9', // 浅蓝色
    '#F8C471', // 桃色
     '#82E0AA', // 浅绿色
   ];

  // 导出为图片
  const exportAsImage = useCallback(() => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    
    // 创建一个临时的SVG元素来计算实际尺寸
    const tempSvg = svg.cloneNode(true) as SVGSVGElement;
    tempSvg.setAttribute('width', '1200');
    tempSvg.setAttribute('height', '800');
    tempSvg.style.background = 'white';
    
    const tempSvgData = new XMLSerializer().serializeToString(tempSvg);
    const svgBlob = new Blob([tempSvgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = 1200;
      canvas.height = 800;
      
      if (ctx) {
        // 设置白色背景
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制SVG
        ctx.drawImage(img, 0, 0);
        
        // 下载图片
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `思维导图_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        }, 'image/png');
      }
      
      URL.revokeObjectURL(svgUrl);
    };
    
    img.src = svgUrl;
  }, []);

  // 解析数据并创建节点
  const parseData = useCallback(() => {
    // 首先清理输入数据中的格式符号
    const cleanedData = cleanText(data);
    const lines = cleanedData.split('\n').filter(line => line.trim());
    const newNodes: Record<string, Node> = {};
    
    // 创建中心节点
    const centerNode: Node = {
      id: 'center',
      text: '视频内容总结',
      x: 400,
      y: 300,
      level: 0,
      children: [],
      color: '#1E40AF'
    };
    newNodes['center'] = centerNode;

    // 智能解析AI总结内容，提取关键信息点
    const extractKeyPoints = (text: string) => {
      const sentences = text.split(/[。！？；]/).filter(s => s.trim().length > 8);
      const keyPoints: { main: string; details: string[] }[] = [];
      
      // 识别关键词模式，用于分组相关内容
      const keywordPatterns = [
        { keywords: ['介绍', '概述', '背景', '简介'], category: '基本信息' },
        { keywords: ['方法', '技巧', '步骤', '流程', '过程'], category: '方法技巧' },
        { keywords: ['原理', '机制', '原因', '为什么'], category: '原理机制' },
        { keywords: ['效果', '结果', '影响', '作用'], category: '效果影响' },
        { keywords: ['建议', '推荐', '注意', '提醒'], category: '建议提醒' },
        { keywords: ['总结', '结论', '要点', '核心'], category: '核心要点' }
      ];
      
      // 按关键词分组句子
      const groups: { [key: string]: string[] } = {};
      const ungrouped: string[] = [];
      
      sentences.forEach(sentence => {
        let grouped = false;
        for (const pattern of keywordPatterns) {
          if (pattern.keywords.some(keyword => sentence.includes(keyword))) {
            if (!groups[pattern.category]) groups[pattern.category] = [];
            groups[pattern.category].push(sentence.trim());
            grouped = true;
            break;
          }
        }
        if (!grouped && sentence.trim().length > 15) {
          ungrouped.push(sentence.trim());
        }
      });
      
      // 创建主要节点
      Object.entries(groups).forEach(([category, sentences]) => {
        if (sentences.length > 0) {
          const mainSentence = sentences[0];
          const details = sentences.slice(1, 3); // 最多2个详细信息
          keyPoints.push({ main: `${category}: ${mainSentence}`, details });
        }
      });
      
      // 添加未分组的重要句子
      ungrouped.slice(0, 3).forEach(sentence => {
        keyPoints.push({ main: sentence, details: [] });
      });
      
      return keyPoints.slice(0, 6); // 最多6个主要节点
    };
    
    const keyPoints = extractKeyPoints(cleanedData);
    let nodeCounter = 0;
    
    // 优化布局算法：更好的空间分布和视觉平衡
    const layoutNodes = () => {
      const totalNodes = keyPoints.length;
      const centerX = 400;
      const centerY = 300;
      
      // 根据节点数量动态调整布局参数
      const baseRadius = Math.max(280, 220 + totalNodes * 25); // 增大基础半径
      const verticalSpacing = Math.max(120, 160 - totalNodes * 8); // 增大垂直间距
      
      keyPoints.forEach((point, index) => {
        const mainNodeId = `main-${index}`;
        
        // 改进的分布算法：更均匀的圆形分布
        const angle = (index / totalNodes) * 2 * Math.PI - Math.PI / 2; // 从顶部开始
        const radius = baseRadius;
        
        // 计算主节点位置（圆形分布）
        const mainX = centerX + Math.cos(angle) * radius;
        const mainY = centerY + Math.sin(angle) * radius * 0.8; // 减少椭圆压缩，更接近圆形
        
        // 处理主节点文本
        let mainText = point.main;
        if (mainText.length > 45) {
          mainText = mainText.substring(0, 45) + '...';
        }
        
        // 创建主节点（二级）
        const mainNode: Node = {
          id: mainNodeId,
          text: mainText,
          x: mainX,
          y: mainY,
          level: 1,
          parentId: 'center',
          children: [],
          color: colors[index % colors.length]
        };
        
        newNodes[mainNodeId] = mainNode;
        newNodes['center'].children.push(mainNodeId);
        
        // 创建子节点（三级）- 沿着主节点的延伸方向
        point.details.forEach((detail, detailIndex) => {
          const subNodeId = `sub-${index}-${detailIndex}`;
          let detailText = detail.trim();
          if (detailText.length > 40) {
            detailText = detailText.substring(0, 40) + '...';
          }
          
          // 子节点沿着从中心到主节点的方向延伸
          const extendDistance = 160 + detailIndex * 120; // 增大延伸距离
          const subX = centerX + Math.cos(angle) * (radius + extendDistance);
          const subY = centerY + Math.sin(angle) * (radius + extendDistance) * 0.8; // 与主节点保持一致的椭圆比例
          
          // 为多个子节点添加更大的垂直偏移
          const verticalOffset = (detailIndex - (point.details.length - 1) / 2) * 60; // 增大垂直偏移
          
          const subNode: Node = {
            id: subNodeId,
            text: detailText,
            x: subX,
            y: subY + verticalOffset,
            level: 2,
            parentId: mainNodeId,
            children: [],
            color: colors[index % colors.length]
          };
          
          newNodes[subNodeId] = subNode;
          newNodes[mainNodeId].children.push(subNodeId);
        });
      });
    };
    
    layoutNodes();

    setNodes(newNodes);
  }, [data]);

  useEffect(() => {
    parseData();
  }, [parseData]);

  // 获取SVG坐标
  const getSVGCoordinates = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    
    return {
      x: viewBox.x + (clientX - rect.left) * scaleX,
      y: viewBox.y + (clientY - rect.top) * scaleY
    };
  };

  // 鼠标按下事件
  const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
    e.preventDefault();
    const svgCoords = getSVGCoordinates(e.clientX, e.clientY);
    
    if (nodeId && nodes[nodeId]) {
      // 开始拖拽节点
      setDraggedNode(nodeId);
      setDragOffset({
        x: svgCoords.x - nodes[nodeId].x,
        y: svgCoords.y - nodes[nodeId].y
      });
    } else {
      // 开始平移画布
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // 鼠标移动事件
  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNode) {
      // 拖拽节点
      const svgCoords = getSVGCoordinates(e.clientX, e.clientY);
      setNodes(prev => ({
        ...prev,
        [draggedNode]: {
          ...prev[draggedNode],
          x: svgCoords.x - dragOffset.x,
          y: svgCoords.y - dragOffset.y
        }
      }));
    } else if (isPanning) {
      // 平移画布
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      setViewBox(prev => ({
        ...prev,
        x: prev.x - deltaX * (prev.width / (containerRef.current?.clientWidth || 800)),
        y: prev.y - deltaY * (prev.height / (containerRef.current?.clientHeight || 600))
      }));
      
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // 鼠标释放事件
  const handleMouseUp = () => {
    setDraggedNode(null);
    setIsPanning(false);
    setDragOffset({ x: 0, y: 0 });
  };

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const svgCoords = getSVGCoordinates(e.clientX, e.clientY);
    
    setViewBox(prev => {
      const newWidth = prev.width * scaleFactor;
      const newHeight = prev.height * scaleFactor;
      
      return {
        x: svgCoords.x - (svgCoords.x - prev.x) * scaleFactor,
        y: svgCoords.y - (svgCoords.y - prev.y) * scaleFactor,
        width: newWidth,
        height: newHeight
      };
    });
  };

  // 绘制连接线
  const renderConnections = () => {
    const connections: JSX.Element[] = [];
    
    Object.values(nodes).forEach(node => {
      if (node.parentId && nodes[node.parentId]) {
        const parent = nodes[node.parentId];
        
        // 判断分支位置，计算连接点
        const isLeftSide = node.x < parent.x;
        const isSubNode = node.level === 2;
        const isParentCenter = parent.id === 'center';
        
        // 使用与节点渲染相同的宽度计算逻辑
        const fontSize = isSubNode ? 11 : 12;
        const padding = isSubNode ? 20 : 25;
        const maxNodeWidth = isSubNode ? 180 : 220;
        const textLines = wrapText(node.text, maxNodeWidth - padding, fontSize);
        
        const getTextWidth = (text: string) => {
          let width = 0;
          for (const char of text) {
            width += /[\u4e00-\u9fa5]/.test(char) ? fontSize : fontSize * 0.6;
          }
          return width;
        };
        
        const longestLine = textLines.reduce((max, line) => 
          getTextWidth(line) > getTextWidth(max) ? line : max, '');
        const estimatedWidth = getTextWidth(longestLine) + padding;
        const nodeWidth = Math.max(isSubNode ? 120 : 140, Math.min(maxNodeWidth, estimatedWidth));
        
        // 连接点计算 - 适应圆形布局
        let parentConnectX, parentConnectY, nodeConnectX, nodeConnectY;
        
        if (isParentCenter) {
          // 中心节点到主节点的连接 - 计算从中心到节点的方向
          const dx = node.x - parent.x;
          const dy = node.y - parent.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const unitX = dx / distance;
          const unitY = dy / distance;
          
          // 中心节点边缘点
          const centerRadius = 100;
          parentConnectX = parent.x + unitX * centerRadius;
          parentConnectY = parent.y + unitY * centerRadius;
          
          // 主节点边缘点（朝向中心的一侧）
          const nodeRadius = nodeWidth / 2;
          nodeConnectX = node.x - unitX * nodeRadius;
          nodeConnectY = node.y - unitY * nodeRadius;
        } else {
          // 主节点到子节点的连接
          const dx = node.x - parent.x;
          const dy = node.y - parent.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const unitX = dx / distance;
          const unitY = dy / distance;
          
          // 主节点边缘点（朝向子节点的一侧）
          const parentRadius = 110; // 主节点半径
          parentConnectX = parent.x + unitX * parentRadius;
          parentConnectY = parent.y + unitY * parentRadius;
          
          // 子节点边缘点（朝向主节点的一侧）
          const nodeRadius = nodeWidth / 2;
          nodeConnectX = node.x - unitX * nodeRadius;
          nodeConnectY = node.y - unitY * nodeRadius;
        }
        
        // 创建优雅的曲线路径
        const dx = nodeConnectX - parentConnectX;
        const dy = nodeConnectY - parentConnectY;
        
        // 控制点计算，为子节点创建更紧凑的曲线
        const curveFactor = isSubNode ? 0.3 : 0.5;
        const controlX1 = parentConnectX + dx * curveFactor;
        const controlY1 = parentConnectY;
        const controlX2 = parentConnectX + dx * curveFactor;
        const controlY2 = nodeConnectY;
        
        const pathData = `M ${parentConnectX} ${parentConnectY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${nodeConnectX} ${nodeConnectY}`;
        
        // 根据节点层级设置不同的连接线样式
        const lineStyles = isSubNode ? {
          glowWidth: "4",
          glowOpacity: "0.08",
          mediumWidth: "2",
          mediumOpacity: "0.2",
          mainWidth: "1",
          mainOpacity: "0.7",
          dashArray: "3,2"
        } : {
          glowWidth: "6",
          glowOpacity: "0.1",
          mediumWidth: "3",
          mediumOpacity: "0.3",
          mainWidth: "1.5",
          mainOpacity: "0.9",
          dashArray: "none"
        };
        
        connections.push(
          <g key={`${parent.id}-${node.id}`}>
            {/* 发光效果背景 */}
            <path
              d={pathData}
              stroke={node.color}
              strokeWidth={lineStyles.glowWidth}
              fill="none"
              opacity={lineStyles.glowOpacity}
              strokeLinecap="round"
              strokeDasharray={lineStyles.dashArray}
              className={draggedNode ? "" : "transition-all duration-300"}
            />
            {/* 中等发光效果 */}
            <path
              d={pathData}
              stroke={node.color}
              strokeWidth={lineStyles.mediumWidth}
              fill="none"
              opacity={lineStyles.mediumOpacity}
              strokeLinecap="round"
              strokeDasharray={lineStyles.dashArray}
              className={draggedNode ? "" : "transition-all duration-300"}
            />
            {/* 主连接线 */}
            <path
              d={pathData}
              stroke={node.color}
              strokeWidth={lineStyles.mainWidth}
              fill="none"
              opacity={lineStyles.mainOpacity}
              strokeLinecap="round"
              strokeDasharray={lineStyles.dashArray}
              className={draggedNode ? "" : "transition-all duration-300"}
            />
          </g>
        );
      }
    });
    
    return connections;
  };

  // 文字换行处理
  const wrapText = (text: string, maxWidth: number, fontSize: number = 12) => {
    // 中文字符宽度约为fontSize，英文字符约为fontSize * 0.6
    const getCharWidth = (char: string) => {
      return /[\u4e00-\u9fa5]/.test(char) ? fontSize : fontSize * 0.6;
    };
    
    const lines: string[] = [];
    let currentLine = '';
    let currentWidth = 0;
    
    for (const char of text) {
      const charWidth = getCharWidth(char);
      if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  };

  // 渲染节点
  const renderNodes = () => {
    return Object.values(nodes).map(node => {
      const isCenter = node.id === 'center';
      const isSubNode = node.level === 2;
      const fontSize = isCenter ? 14 : (isSubNode ? 11 : 12);
      const padding = isCenter ? 30 : (isSubNode ? 20 : 25);
      const maxNodeWidth = isCenter ? 200 : (isSubNode ? 180 : 220);
      const textLines = wrapText(node.text, maxNodeWidth - padding, fontSize);
      
      // 根据文字内容动态计算节点宽度
      const getTextWidth = (text: string) => {
        let width = 0;
        for (const char of text) {
          width += /[\u4e00-\u9fa5]/.test(char) ? fontSize : fontSize * 0.6;
        }
        return width;
      };
      
      const longestLine = textLines.reduce((max, line) => 
        getTextWidth(line) > getTextWidth(max) ? line : max, '');
      const estimatedWidth = getTextWidth(longestLine) + padding;
      const nodeWidth = Math.max(isSubNode ? 120 : 140, Math.min(maxNodeWidth, estimatedWidth));
      
      const lineHeight = fontSize + 3;
      const nodeHeight = Math.max(
        isCenter ? 50 : (isSubNode ? 35 : 40), 
        textLines.length * lineHeight + padding
      );
      
      return (
        <g key={node.id}>
          {/* 节点背景 */}
          <rect
            x={node.x - nodeWidth / 2}
            y={node.y - nodeHeight / 2}
            width={nodeWidth}
            height={nodeHeight}
            rx={isCenter ? 25 : (isSubNode ? 10 : 15)}
            fill={isCenter ? node.color : (isSubNode ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)')}
            stroke={node.color}
            strokeWidth={isCenter ? 0 : (isSubNode ? 1 : 1.5)}
            className={cn(
              'cursor-move',
              draggedNode ? '' : 'transition-all duration-300',
              draggedNode === node.id ? 'opacity-80' : 'hover:opacity-95 hover:stroke-2'
            )}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            style={{
              filter: isCenter ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.15))' : 
                      isSubNode ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' : 
                      'drop-shadow(0 3px 6px rgba(0,0,0,0.08))',
              strokeDasharray: isSubNode ? '2,2' : 'none',
              opacity: isSubNode ? 0.9 : 1
            }}
          />
          
          {/* 节点文本 - 多行 */}
          {textLines.map((line, index) => {
            return (
              <text
                key={index}
                x={isCenter ? node.x : node.x - nodeWidth / 2 + 12}
                y={node.y - (textLines.length - 1) * lineHeight / 2 + index * lineHeight}
                textAnchor={isCenter ? "middle" : "start"}
                dominantBaseline="middle"
                fill={isCenter ? 'white' : (isSubNode ? '#4A5568' : '#2D3748')}
                fontSize={fontSize}
                fontWeight={isCenter ? 'bold' : (isSubNode ? '400' : '500')}
                className="pointer-events-none select-none"
              >
                {line}
              </text>
            );
          })}
          
          {/* 节点装饰圆点 */}
          {!isCenter && (
            <circle
              cx={node.x + nodeWidth / 2 + 8}
              cy={node.y}
              r={isSubNode ? 2 : 3}
              fill={node.color}
              opacity={isSubNode ? 0.4 : 0.6}
            />
          )}
        </g>
      );
    });
  };

  return (
    <div 
      ref={containerRef}
      className={cn('mind-map-container w-full h-full bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50 relative overflow-hidden', className)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onMouseDown={(e) => handleMouseDown(e)}
        onWheel={handleWheel}
      >
        {/* 背景网格 */}
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#F1F5F9" strokeWidth="0.8" opacity="0.6"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* 连接线 */}
        {renderConnections()}
        
        {/* 节点 */}
        {renderNodes()}
      </svg>
      
      {/* 操作提示和导出按钮 */}
      <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600">
        <div>拖拽节点移动 • 滚轮缩放 • 拖拽空白区域平移</div>
      </div>
      
      {/* 导出按钮 */}
      <div className="absolute top-4 right-4">

      </div>
    </div>
  );
};

export default MindMap;