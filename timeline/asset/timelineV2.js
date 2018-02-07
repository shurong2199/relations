var tl = new TimelineBar(d3.select('#timelineBox').node());
var timerId = null;

function selectChange(el) {
    el.checked ? tl.showSelect() : tl.hideSelect();
}

function clearChange() {
    tl.clearBrush();
}

var timeLineCache = new Map();

function fetchTimeLine(companyId) {
    toggleMask(true);

    var nodesList, linksList;

    var tlOptions = {
        event: {
            onBrush: function (start, end) {
                start = start.getTime();
                end = end.getTime();
                if (start == end) {
                    linksList.forEach(function (link) {
                        link.relation.forEach(function (l) {
                            l.filter = false;
                        })
                        link.source.filter = false;
                    })
                } else {
                    linksList.forEach(function (link, index) {
                        link.relation.forEach(function (l, i) {
                            var time = new Date(l.starDate).getTime();
                            l.filter = !(time > start && time < end);
                        })
                        link.source.filter = !link.relation.filter(function (d) {
                            return !d.filter
                        }).length
                    })
                }
                reStatus();
            }
        },
        height: 80,
        zoom: [0.5, 0.5],
        startZoom: 0.5
        // ,enableLiveTimer:true
    };

    // var url = '../js/config/data/timeline.json';
    var url = api('getTimeLine', {
        companyId: companyId
    });

    var isOnGraphElement = false;
    var padding = -10;
    var ani = new animation();

    var width = d3.select('#relation').node().clientWidth;
    var height = d3.select('#relation').node().clientHeight;

    // 比例尺设置大于可见宽高，避免全屏后右边及下边选取不到
    var xScale = d3.scale.linear()
        .domain([0, width * 2])
        .range([0, width * 2]);

    var yScale = d3.scale.linear()
        .domain([height * 2, 0])
        .range([height * 2, 0]);

    var d3brush = d3.svg.brush()
        .x(xScale)
        .y(yScale)
        .extent([
            [0, 0],
            [0, 0]
        ]);

    var force = d3.layout.force()
        .size([width, height])
        .charge(-400)
        .linkDistance(200)
        .charge(-800)
        .on('tick', tick);

    var drag = force.drag()
        .on('dragstart', dragstart);

    var zoom = d3.behavior.zoom()
        .scaleExtent([0.25, 2])
        .on('zoom', zoomFn);

    var svg = d3.select('#relation').append('svg')
        .attr('class', 'svgCanvas')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .call(zoom)
        .on('dblclick.zoom', null);

    // const zoomOverlay = svg.append('rect')
    //     .attr('class', 'zoom-overlay hidden');

    const container = svg.append('g')
        .attr('class', 'container')
        .attr('opacity', 0);

    var brushRect = container.append('g')
        .attr('class', 'brush-rect');

    var link = container.selectAll('.link');
    var node = container.selectAll('.node');

    var span = d3.select('body').append('span')
        .style('font-size', '12px')
        .style('line-height', '12px');

    var markerList = [];
    var markerStyle = {
        markerUnits: 'strokeWidth',
        markerWidth: '12',
        markerHeight: '12',
        viewBox: '0 0 12 12',
        refX: '10',
        refY: '6',
        orient: 'auto'
    };

    container.selectAll('.marker').data(['SERVE', 'INVEST_C', 'OWN', 'TELPHONE']).enter()
        .append('marker')
        .attr('id', function (d) {
            var dom = d3.select(this);
            for (var i in markerStyle) dom.attr(i, markerStyle[i])
            return d
        })
        .append('path')
        .attr('d', 'M2,2 L10,6 L2,10 L6,6 L2,2');

    var graph = timeLineCache.get(url);
    if (graph) {
        setTimeout(function () {
            renderTimeline(graph);
        }, 10);
    } else {
        d3.json(url, function (error, graph) {
            if (error) {
                toggleMask(false);
                return console.error(error);
            }
            if (typeof graph === 'string') {
                try {
                    graph = JSON.parse(graph);
                } catch (error) {
                    toggleMask(false);
                    console.error('无法解析 JOSN 格式！', url);
                    return;
                }
            }
            timeLineCache.set(url, graph);
            renderTimeline(graph);
        });
    }

    var amoutIdentity;

    function renderTimeline(graph) {
        // --> 绘制时间轴工具条
        var barData = [];
        var barMap = {};
        if (graph.relations) {
            graph.relations.forEach(function (d) {
                barMap[d.starDate] = barMap[d.starDate] ? barMap[d.starDate] + 1 : 1;
            })
        }
        for (var i in barMap) {
            barData.push({
                at: new Date(i),
                value: barMap[i],
                type: 'bar'
            })
        }
        var d = [{
            label: 'bar',
            data: barData
        }];
        tl.reDraw(d, tlOptions);
        // tl.showSelect();


        // --> 绘制关系图 
        nodesList = JSON.parse(JSON.stringify(graph.nodes));
        var nodesObj = {};
        linksList = [];
        var linksObj = {};
        var amoutList = [];
        nodesList.forEach(function (d) {
            nodesObj[d.id] = d;
        });

        graph.relations.forEach(function (d) {
            var l;
            if (linksObj[[d.startNode, d.endNode]]) {
                l = linksObj[[d.startNode, d.endNode]];
            } else {
                l = linksObj[[d.startNode, d.endNode]] = {
                    relation: [],
                    startNode: d.startNode,
                    endNode: d.endNode
                }
            }
            l.relation.push({
                type: d.type,
                id: d.id,
                label: d.label,
                parent: l,
                amout: d.amout,
                starDate: d.starDate
            });
            if (d.amout) amoutList.push(d.amout);
        });

        // 定义线性比例尺
        amoutIdentity = d3.scale.linear()
            .range([8, 15])
            .domain(d3.extent(amoutList));

        for (var i in linksObj) {
            linksList.push(linksObj[i]);
        }
        linksList.forEach(function (d) {
            d.source = nodesObj[d.startNode]
            d.target = nodesObj[d.endNode]
        });

        force.on('end', function () {
            // // 固定所有节点
            // nodesList.forEach(node => {
            //     node.fixed = true;
            // });
            // 显示关系图
            container.attr('opacity', 1);
            d3.select('.timeline-legend').style('opacity', 1);
            // 显示时间轴
            d3.select('#timeline').style('opacity', 1);
            toggleMask(false);
        });

        force
            .nodes(nodesList)
            .links(linksList)
            .start();

        link = link.data(linksList)
            .enter().append('g')
            .attr('class', 'link')
            .each(function (link) {
                var g = d3.select(this);
                var lineEnter = g.selectAll('.line').data(link.relation).enter();
                lineEnter.append('line').each(function (d) {
                    d3.select(this).classed(d.type, true).attr('marker-end', 'url(#' + d.type + ')');;
                });
                lineEnter.append('text').text(function (d) {
                    return d.label
                });
            });

        link
            .on('mouseenter', function () {
                isOnGraphElement = true;
            })
            .on('mouseleave', function () {
                isOnGraphElement = false;
            });

        node = node.data(nodesList)
            .enter().append('g')
            .attr('class', 'node');

        var s = span.node();

        node.each(function (d) {
            d.selected = false;
            d.previouslySelected = false;
            var node = d3.select(this).append('circle')
                .call(circle);
            var text = d3.select(this).append('text')
                .text(function (d) {
                    var s = d.name
                    if (s.length > 6) return s.substr(0, 6);
                    return s;
                })
                .attr('transform', function () {
                    s.innerText = d.name;
                    return 'translate(' + [0, s.offsetHeight / 4] + ')';
                });
            d3.select(this).classed(d.ntype, true);
        });

        node
            .on('dblclick', dblclick)
            .on('mouseenter', function () { isOnGraphElement = true; })
            .on('mouseleave', function () { isOnGraphElement = false; })
            .call(drag);

        d3brush
            .on("brushstart", brushstartFn)
            .on("brush", brushFn)
            .on("brushend", brushendFn)

        brushRect.call(d3brush)
            .selectAll('rect')
            .style('fill-opacity', 0.3);

        // 选中聚焦环
        var selectedHalo = node.append('circle')
            .attr('r', function (d) { return circleStyle[d.ntype].r + 6; })
            .attr('class', function (d) { return 'halo-' + d.id; })
            .style('fill', 'rgba(0,0,0,.0)')
            .style('stroke', 'rgb(0,209,218)')
            .style('stroke-width', 3)
            .classed('hidden', true);

        // 框选刷
        function brushstartFn() {
            if (d3.event.sourceEvent.type !== 'brushend') {
                node.each(function (d) { d.selected = false; });
                selectedHalo.classed('hidden', true);
            }
        }
        function brushFn() {
            if (d3.event.sourceEvent.type !== 'brushend') {
                var selection = d3brush.extent();
                var xmin = selection[0][0];
                var xmax = selection[1][0];
                var ymin = selection[0][1];
                var ymax = selection[1][1];
                node.each(function (d) {
                    var x0 = d.x - d.r;
                    var x1 = d.x + d.r;
                    var y0 = d.y - d.r;
                    var y1 = d.y + d.r;
                    //如果节点的坐标在选择框范围内，则被选中
                    var selected = selection != null && (xmin <= x0 && xmax >= x1 && ymin <= y0 && ymax >= y1);
                    d.selected = d.previouslySelected ^ selected;
                });
            }
        }
        function brushendFn() {
            var ids = [];
            if (d3brush.extent() != null) {
                d3.select(this).select('rect.extent').attr({
                    width: 0,
                    height: 0,
                    x: 0,
                    y: 0
                });
                node.each(function (d) {
                    if (d.selected) {
                        ids.push(d.id);
                    }
                    d3.select('.halo-' + d.id).classed('hidden', !d.selected);
                });

                // 圆形菜单
                var isMulti = ids.length > 1;
                var mouse = d3.mouse(this);
                if (ids.length > 0) {
                    var hideMenuAndUnSelectNode = function () {
                        svg.select("#circle_menu").remove();
                        // scope.unSelectNode();
                    }

                    //控制显示菜单
                    svg.select("#circle_menu").remove();
                    d3.select('.container').append('foreignObject')
                        .attr('id', 'circle_menu')
                        .attr("width", 128)
                        .attr("height", 128)
                        .attr("x", mouse[0] - 64)
                        .attr("y", mouse[1] - 64)
                        .html(function () {
                            var html = `` + `
                            <div class='menu-circle'>
                                <div class="menu-ring ${isMulti ? 'multiple-menu' : 'single-menu'}">
                                    <a class='menuItem fa fa-share-alt icon-white'></a>
                                    <a id='menu_btn_findRelations' class='menuItem fa fa-search icon-white multiple-btn'></a>
                                    <a id='menu_btn_findDeepRelations' class='menuItem fa fa-search-plus icon-white multiple-btn'></a>
                                    <a id='menu_btn_trash' class='menuItem fa fa-trash icon-white '></a>
                                    <a id='menu_btn_toggleSelection' class='menuItem fa fa-th-list icon-white single-btn'></a>
                                    <a id ='menu_btn_closeNodeRelations' class='menuItem fa fa-compress icon-white single-btn'></a>
                                    <a id ='menu_btn_openNodeRelations' class='menuItem fa fa-expand icon-white single-btn'></a>
                                    <a id='menu_btn_refresh' class='menuItem fa fa-refresh icon-white multiple-btn'></a>
                                </div>
                                <a href='#' class='center fa fa-remove icon-white'></a>
                            </div>`;
                            return html;
                        });

                    // scope.selectNode();

                    var items = document.querySelectorAll('.menuItem');
                    
                    for (var i = 0, l = items.length; i < l; i++) {
                        items[i].style.left = (50 - 35 * Math.cos(-0.5 * Math.PI - 2 * (1 / l) * i * Math.PI)).toFixed(4) + "%";
                        items[i].style.top = (50 + 35 * Math.sin(-0.5 * Math.PI - 2 * (1 / l) * i * Math.PI)).toFixed(4) + "%";
                    }
                    window.clearTimeout(timerId);
                    timerId = setTimeout(function () {
                        document.querySelector('.menu-circle').classList.toggle('open');
                    }, 20);

                    //默认展开
                    svg.select(".center").on('click', function () {
                        hideMenuAndUnSelectNode();
                    });

                    svg.select('#menu_btn_trash').on('click', function () {
                        // scope.removeNodesAndRelations();
                        hideMenuAndUnSelectNode();
                    });

                    svg.select('#menu_btn_refresh').on('click', function () {
                        if (isMulti) {
                            // scope.refreshNodeRelations();
                            hideMenuAndUnSelectNode();
                        }
                    });

                    svg.select('#menu_btn_toggleSelection').on('click', function () {
                        if (!isMulti) {
                            // scope.toggleSelection();
                            hideMenuAndUnSelectNode();
                        }
                    });

                    svg.select("#menu_btn_openNodeRelations").on('click', function () {
                        if (!isMulti) {
                            // scope.open();
                            hideMenuAndUnSelectNode();
                        }
                    });

                    svg.select("#menu_btn_closeNodeRelations").on('click', function () {
                        if (!isMulti) {
                            // scope.close();
                            hideMenuAndUnSelectNode();
                        }
                    });

                    svg.select("#menu_btn_findRelations").on('click', function () {
                        if (isMulti) {
                            // scope.find();
                            hideMenuAndUnSelectNode();
                        }
                    });

                    svg.select("#menu_btn_findDeepRelations").on('click', function () {
                        if (isMulti) {
                            // scope.findDeep();
                            hideMenuAndUnSelectNode();
                        }
                    });
                }

            }
        }

        // 时间轴范围变化，图元素样式更新
        reStatus();

        // setTimeout(function () {
        //     force.stop();
        // }, 3000);
    }

    var newList, oldList;

    function reStatus() {
        newList = link.data().map(function (d) {
            return d.relation.filter(function (d) {
                return d.filter
            }).map(function (d) {
                return d;
            }).join();
        }).sort().join();
        node.each(function (d) {
            d3.select(this).classed('filter', d.filter);
            d3.select(this).classed('selected', d.selected);
        });
        link.each(function (d) {
            d3.select(this).selectAll('line').each(function (d) {
                d3.select(this).classed('filter', d.filter);
                d3.select(this).classed('selected', d.selected);
            });
        });
        if (oldList != newList) d3render(link);
        oldList = newList;
    }

    function tick() {
        link.each(function (link) {
            var r = link.source.r;
            var b1 = link.target.x - link.source.x;
            var b2 = link.target.y - link.source.y;
            var b3 = Math.sqrt(b1 * b1 + b2 * b2);
            link.angle = 180 * Math.asin(b1 / b3) / Math.PI;
            link.textAngle = b2 > 0 ? 90 - link.angle : link.angle - 90;

            var a = Math.cos(link.angle * Math.PI / 180) * r;
            var b = Math.sin(link.angle * Math.PI / 180) * r;
            link.sourceX = link.source.x + b;
            link.targetX = link.target.x - b;
            link.sourceY = b2 < 0 ? link.source.y - a : link.source.y + a;
            link.targetY = b2 < 0 ? link.target.y + a : link.target.y - a;

            var maxCount = 4; // 最大连线数
            var count = link.relation.length; // 连线条数
            var minStart = count === 1 ? 0 : -r / 2 + padding;
            var start = minStart * (count / maxCount); // 连线线开始位置
            var space = count === 1 ? 0 : Math.abs(minStart * 2 / (maxCount - 1)); // 连线间隔

            var index = 0;

            d3.select(this).selectAll('line').each(function (d, i) {

                // 生成 20 0 -20 的 position 模式
                var position = start + space * index++;

                // 可以按间隔为 10 去生成 0 10 -10 20 -20 模式
                var position = setLinePath(
                    d,
                    link.sourceX,
                    link.sourceY,
                    link.targetX,
                    link.targetY,
                    link.angle,
                    position,
                    r,
                    b2 < 0
                );

                d3.select(this).attr('x1', d.sourceX = position.source[0]);
                d3.select(this).attr('y1', d.sourceY = position.source[1]);
                d3.select(this).attr('x2', d.targetX = position.target[0]);
                d3.select(this).attr('y2', d.targetY = position.target[1]);
            });
            d3.select(this).selectAll('text').attr('transform', function (d) {
                var x = d.sourceX + (d.targetX - d.sourceX) / 2;

                var y = d.sourceY + (d.targetY - d.sourceY) / 2;
                var textAngle = d.parent.textAngle;
                var textRotate = (textAngle > 90 || textAngle < -90) ? (180 + textAngle) : textAngle;
                return ['translate(' + [x, y] + ')', 'rotate(' + textRotate + ')'].join(' ');
            });
        })
            .attr('x1', function (d) {
                return d.source.x;
            })
            .attr('y1', function (d) {
                return d.source.y;
            })
            .attr('x2', function (d) {
                return d.target.x;
            })
            .attr('y2', function (d) {
                return d.target.y;
            });
        node.attr('transform', function (d) {
            return 'translate(' + [d.x, d.y] + ')'
        });
    }

    function dblclick(d) {
        d3.select(this).classed('fixed', d.fixed = false);
    }

    function dragstart(d) {
        d3.select(this).classed('fixed', d.fixed = true);
        d3.event.sourceEvent.stopPropagation();
    }

    function zoomFn() {
        var off = d3.select('#offZoom').property('checked');
        if (off) {
            return;
        }
        var {
            translate,
            scale
        } = d3.event;
        container.attr('transform', 'translate(' + translate + ')scale(' + scale + ')');
    }

    function keyflip() {
        shiftKey = d3.event.shiftKey || d3.event.metaKey;
    }

    function circle() {
        this.each(function (d, i) {
            var style = circleStyle[d.ntype];
            var dom = d3.select(this);
            for (var i in style) {
                dom.attr(i, style[i]);
            }
            d.r = dom.attr('r');
        });
    }

    function setLinePath(
        link,
        sourceX,
        sourceY,
        targetX,
        targetY,
        angle,
        position,
        r,
        isY
    ) {
        if (position > r) {
            return;
        }
        // s 两次三角函数计算的值
        var s = r - Math.sin(180 * Math.acos(position / r) / Math.PI * Math.PI / 180) * r;

        // _a 和 _b 是拿到 ang 角度的基准值
        var _a = Math.cos(angle * Math.PI / 180);
        var _b = Math.sin(angle * Math.PI / 180);

        // a 和 b 是得到垂直于原点平行 position 长度的偏移量。 两个偏移量按照下面的逻辑相加就是平行线的位置
        var a = _a * position;
        var b = _b * position;
        var rx = _b * s;
        var ry = _a * s;

        return {
            source: [(isY ? sourceX + a : sourceX - a) - rx, (isY ? sourceY + ry : sourceY - ry) + b],
            target: [(isY ? targetX + a : targetX - a) + rx, (isY ? targetY - ry : targetY + ry) + b]
        };
    }

    var circleStyle = {
        Human: {
            r: 30
        },
        Company: {
            r: 50
        }
    }

    function clearAni() {
        ani.stopAll();
        d3.selectAll('.behavior').remove();
        link.each(function (d) {
            d.relation.forEach(function (d) {
                delete d.behavior;
            });
        });
    }

    function d3render(link) {
        clearAni();

        link.filter(function (d) {
            return !d.filter;
        }).each(function (link) {
            var i = 0;
            var _dom = d3.select(this);

            var dom = _dom.selectAll('line').filter(function (d) {
                return (!d.filter) && (d.type == 'INVEST_C' || d.type == 'TELPHONE');
            });

            dom.each(function (d) {
                d.behavior = _dom.append('circle')
                    .attr('r', function (d, i) {
                        return amoutIdentity(d.relation[i].amout) || 5;
                    })
                    .classed('behavior', true);
            });

            ani.start(function () {
                dom.each(function (d, index) {
                    var dom = d3.select(this);
                    var x1 = parseInt(dom.attr('x1'));
                    var y1 = parseInt(dom.attr('y1'));
                    var x2 = parseInt(dom.attr('x2'));
                    var y2 = parseInt(dom.attr('y2'));

                    var x = x1 + ((i % 200) / 199) * (x2 - x1);
                    var y = y1 + ((i % 200) / 199) * (y2 - y1);

                    if (x && y)
                        d.behavior.attr('cx', x).attr('cy', y)
                });
                i++;
            }, 90);
        });
    }

    function toggleMask(isShow = true) {
        let loadingMask = document.querySelector('#timeline-mask');
        if (isShow) {
            if (!loadingMask) {
                const canvas = document.querySelector('#relation');
                loadingMask = document.createElement('div');
                loadingMask.setAttribute('id', 'timeline-mask');
                canvas.appendChild(loadingMask);
            }
            const mask = `` +
                `<div class="loader">
                    <div class="loading-anim">
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    </div>
                </div>`;
            loadingMask.innerHTML = mask;
            loadingMask.style.cssText = 'display: flex';
        } else {
            if (loadingMask) {
                loadingMask.innerHTML = '';
                loadingMask.style.cssText = 'display: none';
            }
        }
    }

    // // 切换拖动/选取
    // d3.select('#offZoom').on('change', function () {
    //     var off = this.checked;
    //     d3.select('.zoom-overlay').classed('hidden', off);
    //     d3.select('.brush-rect').classed('hidden', !off);
    // });
}

// 清理画布
function cleanUpCanvas() {
    d3.select('#relation').html('');
    clearChange();
}